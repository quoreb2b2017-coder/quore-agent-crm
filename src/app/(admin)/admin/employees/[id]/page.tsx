import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { Button } from "@/components/ui/button";
import { FieldSheet, ProfileCard } from "@/components/profile/profile-card";
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
import { EditShiftForm } from "./edit-shift-form";
import { EmployeeTabs, type EmployeeTab } from "./employee-tabs";
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
  const tab: EmployeeTab =
    tabRaw === "profile" || tabRaw === "personal" || tabRaw === "shift" || tabRaw === "access"
      ? tabRaw
      : "history";

  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();
  const [{ data: employee }, { data: onboarding }, companySettings, { data: roleLink }] = await Promise.all([
    supabase.from("employees").select("*").eq("id", id).single(),
    supabase.from("employee_onboarding").select("*").eq("employee_id", id).maybeSingle(),
    loadWorkSettings(),
    supabase
      .from("employee_roles")
      .select("roles(role_key, display_name)")
      .eq("employee_id", id)
      .eq("is_primary", true)
      .maybeSingle(),
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

  // The generated types do not know this relation; loadEmployeeContextFromDb reads it the same way.
  const role = (roleLink?.roles ?? null) as unknown as { role_key: string; display_name: string } | null;

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

  const [{ data: departmentRow }, { data: designation }, history] = await Promise.all([
    employee.department_id
      ? supabase.from("departments").select("name").eq("id", employee.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    employee.designation_id
      ? supabase.from("designations").select("title").eq("id", employee.designation_id).maybeSingle()
      : Promise.resolve({ data: null }),
    tab === "history" ? getEmployeeHistory(id) : null,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="-mb-2">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link href="/admin/employees">
            <ArrowLeft className="size-4" />
            Employees
          </Link>
        </Button>
      </div>

      {tab === "history" && history ? (
        <>
          <section className="border bg-card">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-mint-soft text-sm font-bold text-primary">
                {initials(employee.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">{employee.full_name}</h1>
                  <Pill className="capitalize" tone={employee.employment_status === "ACTIVE" ? "success" : "danger"}>{formatEmploymentStatus(employee.employment_status)}</Pill>
                </div>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  <span className="font-mono text-xs font-semibold">{employee.employee_code}</span> · {roleLabel || "Staff"}
                  {designation?.title ? ` · ${designation.title}` : ""}
                  {employee.joining_date ? ` · joined ${formatDate(employee.joining_date)}` : ""}
                </p>
              </div>
            </div>
            <div className="border-t [&>nav]:border-b-0">
              <EmployeeTabs employeeId={id} active="history" />
            </div>
          </section>
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
          tabs={<EmployeeTabs employeeId={id} active={tab} />}
          actions={
            <EmployeeManageButtons
              employeeId={employee.id}
              fullName={employee.full_name}
              isBlocked={employee.employment_status === "SUSPENDED"}
              isDisabled={employee.employment_status === "TERMINATED"}
              isSelf={employee.id === ctx.employeeId}
              canMakeSuperAdmin={
                viewerIsSuperAdmin &&
                role?.role_key !== "SUPER_ADMIN" &&
                employee.id !== ctx.employeeId &&
                employee.employment_status === "ACTIVE"
              }
            />
          }
          contact={tab !== "profile" ? undefined : [
            {
              label: "Company email",
              value: employee.email,
              copy: true,
              href: `mailto:${employee.email}`,
            },
            {
              label: "Personal email",
              value: onboarding?.personal_email ?? "",
              copy: Boolean(onboarding?.personal_email),
              href: onboarding?.personal_email
                ? `mailto:${onboarding.personal_email}`
                : undefined,
            },
            {
              label: "Phone",
              value: employee.phone ?? "",
              copy: Boolean(employee.phone),
              href: employee.phone ? `tel:${employee.phone}` : undefined,
            },
            { label: "Work location", value: employee.work_location ?? "" },
          ]}
          work={tab !== "profile" ? undefined : [
            { label: "Employee ID", value: employee.employee_code, copy: true },
            { label: "Department", value: departmentRow?.name || roleLabel || "" },
            { label: "Designation", value: designation?.title ?? "" },
            {
              label: "Joined",
              value: employee.joining_date ? formatDate(employee.joining_date) : "",
            },
          ]}
        />
      )}
      {tab === "profile" ? (
        <section className="border bg-card px-4 py-4">
          <h2 className="text-base font-semibold">Update profile</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Change sign-in, name, ID, contact, joining date and department.
          </p>
          <div className="mt-6">
            <EditEmployeeForm
              employee={employee}
              dateOfBirth={onboarding?.date_of_birth ?? null}
              personalEmail={onboarding?.personal_email ?? null}
              currentDepartment={department}
              lockDepartment={targetIsManagement}
            />
          </div>
        </section>
      ) : null}
      {tab === "access" ? (
        <AccessCard
          employeeId={employee.id}
          authUserId={employee.auth_user_id}
          name={employee.full_name}
          roleLabel={roleLabel || "Staff"}
          status={employee.employment_status}
          canReset={viewerIsSuperAdmin && employee.id !== ctx.employeeId}
        />
      ) : null}
      {tab === "personal" ? (
        <section className="border bg-card px-4 py-4">
          <EditPersonalDetailsForm
            employeeId={employee.id}
            joiningDate={employee.joining_date ?? ""}
            workLocation={employee.work_location}
            record={onboarding}
          />
        </section>
      ) : null}
      {tab === "shift" ? (
        <>
          <FieldSheet
            title="Current shift"
            rows={[
              { label: "Shift", value: shiftLabel },
              { label: "Shift assigned", value: shiftUpdatedLabel },
            ]}
          />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <section className="border bg-card px-4 py-4">
              <EditShiftForm
                employeeId={employee.id}
                workSchedule={employee.work_schedule}
                companySettings={companySettings}
              />
            </section>
            <section className="border bg-card px-4 py-4">
              <EmployeeOvertimeForm employeeId={employee.id} employeeName={employee.full_name} />
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
