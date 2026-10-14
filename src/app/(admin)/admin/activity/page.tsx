import { Bath, Coffee, LogIn, Radio, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { ShiftTimeline } from "@/components/activity/shift-timeline";
import { isUuid } from "@/lib/attendance-period";
import { requireViewer } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getProductivityReport } from "@/lib/queries/productivity-report";
import { getShiftActivity, resolveActivityRange } from "@/lib/queries/shift-activity";
import { ShiftCompletion } from "@/components/activity/shift-completion";
import { ActivityFilters } from "./activity-filters";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { seesAll } = await requireViewer();
  if (!seesAll) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Activity" description="Shift activity is visible to Super Admin." />
        <Card>
          <CardContent>
            <EmptyState
              icon={Radio}
              title="Admin only"
              description="Shift activity is visible to Super Admin."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const params = await searchParams;
  const range = resolveActivityRange(one(params.mode), one(params.days), one(params.month));
  const requested = one(params.employee);
  const employeeId = requested && isUuid(requested) ? requested : null;
  const people = await listWatchableEmployees();
  const picked = employeeId ? people.filter((person) => person.id === employeeId) : people;
  const [events, productivity] = await Promise.all([
    getShiftActivity(
    picked.map((person) => ({
      id: person.id,
      fullName: person.full_name,
      employeeCode: person.employee_code,
    })),
    range.start,
    range.end
    ),
    getProductivityReport(picked, range.start, range.end),
  ]);
  const logins = events.filter((event) => event.tone === "login").length;
  const breaks = events.filter((event) => event.label.endsWith("started") && event.tone === "break").length;
  const washrooms = events.filter((event) => event.label === "Washroom").length;
  const meetings = events.filter((event) => event.label === "Meeting requested").length;
  const who = picked.length === 1 ? picked[0].full_name : "All employees";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description={`${range.label} · ${who} · ${range.start} to ${range.end}`}
      />

      <ActivityFilters
        mode={range.mode}
        days={range.days}
        month={range.month}
        employeeId={employeeId}
        employees={people}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Logins" value={logins} icon={LogIn} tone="success" />
        <StatCard label="Breaks" value={breaks} icon={Coffee} tone="warning" />
        <StatCard label="Washroom visits" value={washrooms} icon={Bath} tone="info" />
        <StatCard label="Meetings" value={meetings} icon={Users} />
      </div>

      <ShiftCompletion rows={productivity} />

      {events.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Radio}
              title="No activity in this range"
              description="Pick more days, another month, or a different employee."
            />
          </CardContent>
        </Card>
      ) : (
        <ShiftTimeline events={events} showEmployee />
      )}
    </div>
  );
}
