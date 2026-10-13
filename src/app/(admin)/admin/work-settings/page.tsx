import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/permissions/server";
import { loadWorkSettings } from "@/lib/work-settings-server";
import { federalHolidays } from "@/lib/federal-holidays";
import { formatIsoDate, todayIso } from "@/lib/format";
import { WorkSettingsForm } from "./work-settings-form";

export default async function WorkSettingsPage() {
  await requireSuperAdmin();
  const settings = await loadWorkSettings();
  const year = Number(todayIso().slice(0, 4));
  const holidays = federalHolidays(year);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Work settings"
        description="Shift login, logout, late cutoff, and time zone. Productive time still starts at login time."
      />
      <Card>
        <CardContent className="pt-6">
          <WorkSettingsForm settings={settings} />
        </CardContent>
      </Card>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b px-5 py-4">
          <h3 className="text-[15px] font-semibold">US federal holidays · {year}</h3>
          <p className="text-sm text-muted-foreground">
            These days are marked Holiday automatically for every employee. A day already marked present,
            late, leave, half day, or week off is left as it is. Saturday holidays move to Friday, Sunday
            holidays move to Monday.
          </p>
        </div>
        <ul className="divide-y">
          {holidays.map((holiday) => (
            <li key={holiday.date} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <span>{holiday.name}</span>
              <span className="text-muted-foreground tabular-nums">{formatIsoDate(holiday.date)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
