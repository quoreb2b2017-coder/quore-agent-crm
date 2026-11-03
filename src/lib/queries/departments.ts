import "server-only";
import { createDataClient as createClient } from "@/lib/supabase/data";
import {
  DEPARTMENT_KIND_OPTIONS,
  isDepartmentKind,
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
    rows.filter((row) => row.kind && isDepartmentKind(row.kind)).map((row) => [row.kind as DepartmentKind, row])
  );

  for (const item of DEPARTMENT_KIND_OPTIONS) {
    if (byKind.has(item.kind)) continue;
    // Prefer renaming a legacy row that still uses the default name.
    const legacy = rows.find(
      (row) => !row.kind && row.name.trim().toLowerCase() === item.defaultName.toLowerCase()
    );
    if (legacy) {
      await supabase.from("departments").update({ kind: item.kind }).eq("id", legacy.id);
      legacy.kind = item.kind;
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

/** Org departments with role-group kind. Ensures Sales / Management / HR exist. */
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
  if (normalized.includes("sale") || normalized.includes("agent")) return "SALES";
  if (normalized.includes("hr") || normalized === "human resources") return "HR";
  if (
    normalized.includes("manage") ||
    normalized.includes("database") ||
    normalized.includes("email") ||
    normalized.includes("marketing")
  ) {
    return "MANAGEMENT";
  }
  return "SALES";
}

function kindSort(kind: DepartmentKind) {
  return kind === "SALES" ? 0 : kind === "MANAGEMENT" ? 1 : 2;
}
