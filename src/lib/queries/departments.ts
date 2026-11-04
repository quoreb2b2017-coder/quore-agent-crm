import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEPARTMENT_KIND_OPTIONS,
  inferDepartmentKindFromName,
  isDepartmentKind,
  matchesDepartmentName,
  normalizeDepartmentKind,
  type DepartmentKind,
} from "@/lib/departments";

export type DepartmentOption = {
  id: string;
  name: string;
  kind: DepartmentKind;
};

type DeptRow = { id: string; name: string; kind: string | null };

/** Persist kind; fall back to legacy check-constraint values when 0034 is not applied. */
async function writeKind(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  kind: DepartmentKind
): Promise<string> {
  const { error } = await supabase.from("departments").update({ kind }).eq("id", id);
  if (!error) return kind;

  const legacy =
    kind === "ADMIN_CONTROL"
      ? "HR"
      : kind === "DATABASE" || kind === "MARKETING"
        ? "MANAGEMENT"
        : null;
  if (!legacy) return kind;

  const { error: legacyError } = await supabase
    .from("departments")
    .update({ kind: legacy })
    .eq("id", id);
  return legacyError ? kind : legacy;
}

async function insertCore(
  supabase: ReturnType<typeof createServiceClient>,
  name: string,
  kind: DepartmentKind
): Promise<DeptRow | null> {
  const attempt = async (k: string) =>
    supabase.from("departments").insert({ name, kind: k }).select("id, name, kind").maybeSingle();

  let { data, error } = await attempt(kind);
  if (!error && data) return data;

  if (kind === "ADMIN_CONTROL") {
    ({ data, error } = await attempt("HR"));
    if (!error && data) return data;
  }
  if (kind === "DATABASE" || kind === "MARKETING") {
    ({ data, error } = await attempt("MANAGEMENT"));
    if (!error && data) return data;
  }

  // Name taken — attach kind to that row.
  const { data: named } = await supabase
    .from("departments")
    .select("id, name, kind")
    .ilike("name", name)
    .maybeSingle();
  if (named) {
    named.kind = await writeKind(supabase, named.id, kind);
    return named;
  }
  return null;
}

async function ensureCoreDepartments(
  supabase: ReturnType<typeof createServiceClient>,
  rows: DeptRow[]
) {
  const byKind = new Map<DepartmentKind, DeptRow>();

  for (const row of rows) {
    const kind = normalizeDepartmentKind(row.kind, row.name);
    if (!kind) continue;
    if (!byKind.has(kind)) byKind.set(kind, row);
  }

  for (const item of DEPARTMENT_KIND_OPTIONS) {
    if (byKind.has(item.kind)) {
      const existing = byKind.get(item.kind)!;
      if (existing.kind !== item.kind) {
        existing.kind = await writeKind(supabase, existing.id, item.kind);
      }
      continue;
    }

    const byName = rows.find((row) => matchesDepartmentName(row.name, item));
    if (byName) {
      byName.kind = await writeKind(supabase, byName.id, item.kind);
      byKind.set(item.kind, byName);
      continue;
    }

    const created = await insertCore(supabase, item.defaultName, item.kind);
    if (created) {
      byKind.set(item.kind, created);
      if (!rows.some((r) => r.id === created.id)) rows.push(created);
    }
  }
}

function displayNameForCore(row: DeptRow, kind: DepartmentKind): string {
  const preferred = DEPARTMENT_KIND_OPTIONS.find((o) => o.kind === kind)!;
  if (matchesDepartmentName(row.name, preferred)) return preferred.defaultName;
  if (row.name.trim().toLowerCase() === preferred.defaultName.toLowerCase()) {
    return preferred.defaultName;
  }
  return row.name;
}

/** All org departments. Core 5 teams are always ensured. */
export async function loadDepartments(): Promise<DepartmentOption[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, kind")
    .order("name");

  if (error) {
    if (/kind/i.test(error.message)) {
      const { data: basic, error: basicError } = await supabase
        .from("departments")
        .select("id, name")
        .order("name");
      if (basicError) throw new Error(basicError.message);
      return (basic ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        kind: inferDepartmentKindFromName(row.name) ?? "SALES",
      }));
    }
    throw new Error(error.message);
  }

  const rows: DeptRow[] = [...(data ?? [])];
  await ensureCoreDepartments(supabase, rows);

  const { data: refreshed } = await supabase
    .from("departments")
    .select("id, name, kind")
    .order("name");

  const mapped = (refreshed ?? rows).map((row) => {
    const kind = normalizeDepartmentKind(row.kind, row.name) ?? "SALES";
    return { id: row.id, name: row.name, kind };
  });

  const coreKinds = new Set(DEPARTMENT_KIND_OPTIONS.map((o) => o.kind));
  const byKind = new Map<DepartmentKind, DepartmentOption>();
  const extras: DepartmentOption[] = [];

  for (const row of mapped) {
    if (!coreKinds.has(row.kind)) {
      extras.push(row);
      continue;
    }
    const preferred = DEPARTMENT_KIND_OPTIONS.find((o) => o.kind === row.kind)!;
    const current = byKind.get(row.kind);
    const labeled = { ...row, name: displayNameForCore(row, row.kind) };

    if (!current) {
      byKind.set(row.kind, labeled);
      continue;
    }

    const rowIsCanonical =
      row.name.trim().toLowerCase() === preferred.defaultName.toLowerCase();
    const currentIsCanonical =
      current.name.trim().toLowerCase() === preferred.defaultName.toLowerCase();

    if (rowIsCanonical && !currentIsCanonical) {
      extras.push(current);
      byKind.set(row.kind, { ...row, name: preferred.defaultName });
    } else {
      // Keep preferred slot; surface the other row as an extra team.
      extras.push(labeled);
    }
  }

  // Last-resort: ensure every core kind appears (real DB id preferred).
  for (const item of DEPARTMENT_KIND_OPTIONS) {
    if (byKind.has(item.kind)) continue;
    const created = await insertCore(supabase, item.defaultName, item.kind);
    if (created) {
      byKind.set(item.kind, {
        id: created.id,
        name: item.defaultName,
        kind: item.kind,
      });
    }
  }

  return [
    ...DEPARTMENT_KIND_OPTIONS.map((item) => byKind.get(item.kind)).filter(
      (row): row is DepartmentOption => Boolean(row)
    ),
    ...extras.sort((a, b) => a.name.localeCompare(b.name)),
  ];
}
