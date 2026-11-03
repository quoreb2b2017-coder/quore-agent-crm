import "server-only";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { STAFF_DEPARTMENTS } from "@/lib/permissions/roles";

export type DepartmentOption = {
  id: string;
  name: string;
};

/** Org departments for Add Employee. Seeds staff labels once if the table is empty. */
export async function loadDepartments(): Promise<DepartmentOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name")
    .order("name");

  if (error) throw new Error(error.message);

  if ((data ?? []).length > 0) {
    return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
  }

  // First-time empty table: create the usual staff department names.
  const { data: seeded, error: seedError } = await supabase
    .from("departments")
    .insert(STAFF_DEPARTMENTS.map((item) => ({ name: item.label })))
    .select("id, name");

  if (seedError) {
    // Race with another request — re-read.
    const { data: again } = await supabase.from("departments").select("id, name").order("name");
    return (again ?? []).map((row) => ({ id: row.id, name: row.name }));
  }

  return (seeded ?? [])
    .map((row) => ({ id: row.id, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
