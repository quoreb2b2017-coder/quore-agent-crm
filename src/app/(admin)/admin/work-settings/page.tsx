import { PageHeader } from "@/components/dashboard/page-header";
import { requireSuperAdmin } from "@/lib/permissions/server";
import { loadWorkSettings } from "@/lib/work-settings-server";
import { federalHolidays } from "@/lib/federal-holidays";
import { todayIso, weekdayShortIst } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WorkSettingsForm } from "./work-settings-form";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function WorkSettingsPage() {
  await requireSuperAdmin();
  const settings = await loadWorkSettings();
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const holidays = federalHolidays(year);
  const next = holidays.find((holiday) => holiday.date >= today) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Work settings"
        description="Company shift, time zone, and default paid leave. US federal holidays are marked automatically."
      />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <section className="rounded-xl border bg-card p-4 md:p-5">
          <WorkSettingsForm settings={settings} />
        </section>
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold">US federal holidays · {year}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {next ? `Next is ${next.name}.` : "No holidays left this year."} Saturday moves to Friday, Sunday to
              Monday. A day already present, late, on leave, half day, or week off stays as it is.
            </p>
          </div>
          <ul className="grid sm:grid-cols-2 xl:grid-cols-1">
            {holidays.map((holiday) => {
              const past = holiday.date < today;
              const upcoming = holiday.date === next?.date;
              const day = Number(holiday.date.slice(8, 10));
              const month = MONTHS[Number(holiday.date.slice(5, 7)) - 1];
              return (
                <li
                  key={holiday.date}
                  className={cn(
                    "flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+2)]:border-b xl:last:border-b-0",
                    past && "text-muted-foreground",
                    upcoming && "bg-primary/5"
                  )}
                >
                  <span className="w-14 shrink-0 text-xs font-medium tabular-nums">
                    {weekdayShortIst(holiday.date)} {day} {month}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{holiday.name}</span>
                  {upcoming ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Next
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
