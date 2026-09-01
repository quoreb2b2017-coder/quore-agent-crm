import { Building2 } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateDepartmentDialog } from "./create-department-dialog";
import { requireSuperAdmin } from "@/lib/permissions/server";

export default async function DepartmentsPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const [{ data: departments }, { data: employees }] = await Promise.all([
    supabase.from("departments").select("id, name, description").order("name"),
    supabase.from("employees").select("department_id").eq("employment_status", "ACTIVE"),
  ]);

  const countByDept = new Map<string, number>();
  for (const e of employees ?? []) {
    if (!e.department_id) continue;
    countByDept.set(e.department_id, (countByDept.get(e.department_id) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Departments"
        description="Organize employees into departments"
        actions={<CreateDepartmentDialog />}
      />
      <Card>
        <CardContent>
          {!departments || departments.length === 0 ? (
            <EmptyState icon={Building2} title="No departments yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Employees</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.description ?? "—"}
                    </TableCell>
                    <TableCell>{countByDept.get(d.id) ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
