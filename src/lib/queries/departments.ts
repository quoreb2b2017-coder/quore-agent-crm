import "server-only";
import { createDataClient as createClient } from "@/lib/supabase/data";
import {
  DEPARTMENT_KIND_OPTIONS,
  isDepartmentKind,
  matchesDepartmentName,
  type DepartmentKind,
} from "@/lib/departments";

export type DepartmentOption = {
  id: string;
  name: string;
  kind: DepartmentKind;
};

async function ensureDepartmentKinds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: { id: string; name: string; kind: string | null }[]
) {
  const byKind = new Map(
    rows
      .filter((row) => row.kind && isDepartmentKind(row.kind))
      .map((row) => [row.kind as DepartmentKind, row])
  );

  for (const item of DEPARTMENT_KIND_OPTIONS) {
    const existing = byKind.get(item.kind);
    if (existing) {
      // Bring old seeded names up to the current default (admin can still rename later).
      if (matchesDepartmentName(existing.name, item) && existing.name !== item.defaultName) {
        await supabase.from("departments").update({ name: item.defaultName }).eq("id", existing.id);
        existing.name = item.defaultName;
      }
      continue;
    }

    const legacy = rows.find(
      (row) => !row.kind && matchesDepartmentName(row.name, item)
    );
    if (legacy) {
      await supabase
        .from("departments")
        .update({ kind: item.kind, name: item.defaultName })
        .eq("id", legacy.id);
      legacy.kind = item.kind;
      legacy.name = item.defaultName;
      byKind.set(item.kind, legacy);
      continue;
    }

    const { data: created } = await supabase
      .from("departments")
      .insert({ name: item.defaultName, kind: item.kind })
      .select("id, name, kind")
      .maybeSingle();
    if (created?.kind && isDepartmentKind(created.kind)) {
      byKind.set(item.kind, created);
      rows.push(created);
    }
  }
}

/** Org departments with role-group kind. Ensures the three core departments exist. */
export async function loadDepartments(): Promise<DepartmentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, kind")
    .order("name");

  if (error) {
    // kind column missing until migration 0032 — fall back without kinds.
    if (/kind/i.test(error.message)) {
      const { data: basic, error: basicError } = await supabase
        .from("departments")
        .select("id, name")
        .order("name");
      if (basicError) throw new Error(basicError.message);
      return (basic ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        kind: inferKindFromName(row.name),
      }));
    }
    throw new Error(error.message);
  }

  const rows = [...(data ?? [])];
  await ensureDepartmentKinds(supabase, rows);

  const { data: refreshed } = await supabase.from("departments").select("id, name, kind").order("name");

  return (refreshed ?? rows)
    .filter((row): row is { id: string; name: string; kind: string } => Boolean(row.kind))
    .filter((row) => isDepartmentKind(row.kind))
    .map((row) => ({ id: row.id, name: row.name, kind: row.kind as DepartmentKind }))
    .sort((a, b) => kindSort(a.kind) - kindSort(b.kind) || a.name.localeCompare(b.name));
}

function inferKindFromName(name: string): DepartmentKind {
  const normalized = name.trim().toLowerCase();
  if (
    normalized.includes("human resource") ||
    normalized === "hr" ||
    normalized.includes("hr ")
  ) {
    return "HR";
  }
  if (
    normalized.includes("executive") ||
    normalized.includes("manage") ||
    normalized.includes("database") ||
    normalized.includes("email") ||
    normalized.includes("marketing")
  ) {
    return "MANAGEMENT";
  }
  if (normalized.includes("sale") || normalized.includes("agent") || normalized.includes("operation")) {
    return "SALES";
  }
  return "SALES";
}

function kindSort(kind: DepartmentKind) {
  // Human Resources, Sales Operations, Executive and Operations
  return kind === "HR" ? 0 : kind === "SALES" ? 1 : 2;
}
