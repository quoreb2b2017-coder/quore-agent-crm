import { requireViewer } from "@/lib/permissions/server";
import { getEmployeeProfileDetails } from "@/lib/queries/profile";
import { ProfileCard } from "@/components/profile/profile-card";
import { SettingsNav } from "@/components/profile/settings-nav";

export default async function SettingsPage() {
  const { ctx } = await requireViewer();
  const details = await getEmployeeProfileDetails(ctx.employeeId);

  return (
    <ProfileCard
      name={ctx.fullName}
      role={ctx.roleDisplayName}
      employeeCode={ctx.employeeCode}
      status={details.employmentStatus || ctx.employmentStatus}
      tabs={
        <SettingsNav
          profileHref="/admin/settings"
          passwordHref="/admin/password"
          active="profile"
        />
      }
      contact={[
        { label: "Email", value: ctx.email, copy: true, href: `mailto:${ctx.email}` },
        {
          label: "Phone",
          value: details.phone,
          copy: Boolean(details.phone),
          href: details.phone ? `tel:${details.phone}` : undefined,
        },
        { label: "Work location", value: details.workLocation },
      ]}
      work={[
        { label: "Employee ID", value: ctx.employeeCode, copy: true },
        { label: "Department", value: details.departmentName || ctx.roleDisplayName },
        { label: "Designation", value: details.designationTitle },
        { label: "Joined", value: details.joiningDate },
      ]}
    />
  );
}
