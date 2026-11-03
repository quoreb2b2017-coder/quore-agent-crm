import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "@/components/profile/profile-card";
import { getCurrentEmployeeContext } from "@/lib/permissions/server";
import {
  isManagement,
  isSuperAdmin,
  staffDepartmentLabel,
  type StaffRoleKey,
  STAFF_ROLE_KEYS,
} from "@/lib/permissions/roles";
import { formatDate, formatDateTime, formatEmploymentStatus, initials } from "@/lib/format";
import { Pill } from "@/components/wt/panel";
import { getEmployeeHistory } from "@/lib/queries/employee-history";
import { applyWorkSchedule, formatMinutesLabel, parseWorkSchedule } from "@/lib/work-settings";
import { loadWorkSettings } from "@/lib/work-settings-server";
import { EditEmployeeForm } from "./edit-employee-form";
import { EditPersonalDetailsForm } from "./edit-personal-details-form";
import { EmployeeOvertimeForm } from "./employee-overtime-form";
import { EmployeeManageButtons } from "./employee-manage-buttons";
import { EmployeeTabs } from "./employee-tabs";
import { EmployeeHistory } from "./employee-history";
import { AccessCard } from "./access-card";

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
  if (!ctx || !isManagement(ctx.roleKey)) {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();
  const [{ data: employee }, { data: onboarding }, companySettings] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).single(),
    supabase.from("employee_onboarding").select("*").eq("employee_id", id).maybeSingle(),
    loadWorkSettings(),
  ]);
  if (!employee) notFound();
  const schedule = parseWorkSchedule(employee.work_schedule);
  const effectiveShift = applyWorkSchedule(companySettings, schedule);
  const shiftLabel = `${formatMinutesLabel(effectiveShift.loginMinutes, effectiveShift.timeZone)} – ${formatMinutesLabel(effectiveShift.logoutMinutes, effectiveShift.timeZone)}${schedule ? "" : " (company)"}`;
  const shiftUpdatedLabel = schedule
    ? schedule.updatedAt
      ? `Updated ${formatDateTime(schedule.updatedAt)}`
      : "Custom shift · save again to record assign time"
    : "Using company default";

  const { data: currentRole } = await supabase
    .from("employee_roles")
    .select("role_id")
    .eq("employee_id", id)
    .eq("is_primary", true)
    .maybeSingle();

  const { data: role } = currentRole
    ? await supabase.from("roles").select("role_key, display_name").eq("id", currentRole.role_id).maybeSingle()
    : { data: null };

  const viewerIsSuperAdmin = isSuperAdmin(ctx.roleKey);
  const targetIsManagement = isManagement(role?.role_key ?? "");
  if (!viewerIsSuperAdmin && targetIsManagement) notFound();

  const department = asStaffRole(role?.role_key);
  const roleLabel =
    role?.role_key === "SUPER_ADMIN"
      ? "Super Admin"
      : role?.role_key === "HR"
        ? "HR"
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
          <section className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-mint-soft text-lg font-semibold text-primary">
              {initials(employee.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[22px] font-semibold tracking-tight">{employee.full_name}</h1>
                <Pill tone={employee.employment_status === "ACTIVE" ? "success" : "danger"}>{formatEmploymentStatus(employee.employment_status)}</Pill>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                <span className="font-mono text-[13px]">{employee.employee_code}</span> · {roleLabel || "Staff"}
                {designation?.title ? ` · ${designation.title}` : ""}
                {employee.joining_date ? ` · joined ${formatDate(employee.joining_date)}` : ""}
              </p>
            </div>
          </section>
          <AccessCard
            employeeId={employee.id}
            authUserId={employee.auth_user_id}
            name={employee.full_name}
            roleLabel={roleLabel || "Staff"}
            status={employee.employment_status}
            canReset={viewerIsSuperAdmin && employee.id !== ctx.employeeId}
          />

          <div className="overflow-hidden rounded-2xl border bg-card">
            <EmployeeTabs employeeId={id} active="history" />
          </div>
          <EmployeeHistory
            employeeId={id}
            employeeName={employee.full_name}
            data={history}
            showPayroll={!targetIsManagement}
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
              canDelete={viewerIsSuperAdmin}
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
            { label: "Shift", value: shiftLabel },
            { label: "Shift assigned", value: shiftUpdatedLabel },
          ]}
        />
      )}
      {tab === "profile" ? (
        <>
          <section
            id="edit-profile"
            className="scroll-mt-6 overflow-hidden rounded-2xl border bg-card px-6 py-6 sm:px-8"
          >
            <h2 className="text-base font-semibold">Edit employee</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Change account, personal / bank details, shift times, and overtime. Scroll here with the Edit
              button above.
            </p>
            <div className="mt-6">
              <EditEmployeeForm
                employee={employee}
                dateOfBirth={onboarding?.date_of_birth ?? null}
                currentDepartment={department}
                companySettings={companySettings}
                lockDepartment={targetIsManagement}
              />
            </div>
            <div className="mt-8 border-t pt-6">
              <EditPersonalDetailsForm
                employeeId={employee.id}
                joiningDate={employee.joining_date ?? ""}
                workLocation={employee.work_location}
                record={onboarding}
              />
            </div>
            <div className="mt-8 border-t pt-6">
              <EmployeeOvertimeForm employeeId={employee.id} employeeName={employee.full_name} />
            </div>
          </section>
          <AccessCard
            employeeId={employee.id}
            authUserId={employee.auth_user_id}
            name={employee.full_name}
            roleLabel={roleLabel || "Staff"}
            status={employee.employment_status}
            canReset={viewerIsSuperAdmin && employee.id !== ctx.employeeId}
          />
        </>
      ) : null}
    </div>
  );
}
