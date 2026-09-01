import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "@/components/profile/profile-card";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import {
  isSuperAdmin,
  staffDepartmentLabel,
  type StaffRoleKey,
  STAFF_ROLE_KEYS,
} from "@/lib/permissions/roles";
import { formatDate } from "@/lib/format";
import { getEmployeeHistory } from "@/lib/queries/employee-history";
import { EditEmployeeForm } from "./edit-employee-form";
import { EmployeeManageButtons } from "./employee-manage-buttons";
import { EmployeeTabs } from "./employee-tabs";
import { EmployeeHistory } from "./employee-history";

function asStaffRole(roleKey: string | undefined): StaffRoleKey | "" {
  if (roleKey && (STAFF_ROLE_KEYS as readonly string[]).includes(roleKey)) {
    return roleKey as StaffRoleKey;
  }
  return "";
}

export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const tabRaw = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab = tabRaw === "profile" ? "profile" : "history";

  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isSuperAdmin(ctx.roleKey)) {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();
  const { data: employee } = await supabase.from("employees").select("*").eq("id", id).single();
  if (!employee) notFound();

  const { data: currentRole } = await supabase
    .from("employee_roles")
    .select("role_id")
    .eq("employee_id", id)
    .eq("is_primary", true)
    .maybeSingle();

  const { data: role } = currentRole
    ? await supabase.from("roles").select("role_key, display_name").eq("id", currentRole.role_id).maybeSingle()
    : { data: null };

  const department = asStaffRole(role?.role_key);
  const roleLabel =
    role?.role_key === "SUPER_ADMIN"
      ? "Super Admin"
      : department
        ? staffDepartmentLabel(department)
        : role?.display_name ?? null;

  const [{ data: departmentRow }, { data: designation }] = await Promise.all([
    employee.department_id
      ? supabase.from("departments").select("name").eq("id", employee.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    employee.designation_id
      ? supabase.from("designations").select("title").eq("id", employee.designation_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const history = tab === "history" ? await getEmployeeHistory(id) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/admin/employees">
            <ArrowLeft className="size-4" />
            Employees
          </Link>
        </Button>
      </div>

      {tab === "history" && history ? (
        <>
          <div className="overflow-hidden rounded-2xl border bg-card">
            <EmployeeTabs employeeId={id} active="history" />
          </div>
          <EmployeeHistory
            employeeId={id}
            data={history}
            showPayroll={role?.role_key !== "SUPER_ADMIN"}
          />
        </>
      ) : (
        <ProfileCard
          name={employee.full_name}
          role={roleLabel || "Staff"}
          employeeCode={employee.employee_code}
          status={employee.employment_status}
          tabs={<EmployeeTabs employeeId={id} active="profile" />}
          actions={
            <EmployeeManageButtons
              employeeId={employee.id}
              fullName={employee.full_name}
              isBlocked={employee.employment_status === "SUSPENDED"}
              isSelf={employee.id === ctx.employeeId}
            />
          }
          contact={[
            {
              label: "Email",
              value: employee.email,
              copy: true,
              href: `mailto:${employee.email}`,
            },
            {
              label: "Phone",
              value: employee.phone ?? "",
              copy: Boolean(employee.phone),
              href: employee.phone ? `tel:${employee.phone}` : undefined,
            },
            { label: "Work location", value: employee.work_location ?? "" },
          ]}
          work={[
            { label: "Employee ID", value: employee.employee_code, copy: true },
            { label: "Department", value: departmentRow?.name || roleLabel || "" },
            { label: "Designation", value: designation?.title ?? "" },
            {
              label: "Joined",
              value: employee.joining_date ? formatDate(employee.joining_date) : "",
            },
          ]}
        >
          <div>
            <h2 className="text-sm font-semibold">Edit account</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Super Admin can change email and set a new login password. Saved passwords stay encrypted.
            </p>
            <div className="mt-5">
              <EditEmployeeForm
                employee={employee}
                currentDepartment={department}
                lockDepartment={role?.role_key === "SUPER_ADMIN"}
              />
            </div>
          </div>
        </ProfileCard>
      )}
    </div>
  );
}
