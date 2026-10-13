import { Bath, Coffee, LogIn, Radio, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { ShiftTimeline } from "@/components/activity/shift-timeline";
import { shiftWindowLabel, todayIso } from "@/lib/format";
import { requireViewer } from "@/lib/permissions/server";
import { listWatchableEmployees } from "@/lib/queries/admin-dashboard";
import { getShiftActivity } from "@/lib/queries/shift-activity";

export default async function AdminActivityPage() {
  const { seesAll } = await requireViewer();
  if (!seesAll) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Activity" description={shiftWindowLabel()} />
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

  const people = await listWatchableEmployees();
  const events = await getShiftActivity(
    people.map((person) => ({
      id: person.id,
      fullName: person.full_name,
      employeeCode: person.employee_code,
    })),
    todayIso()
  );
  const logins = events.filter((event) => event.tone === "login").length;
  const breaks = events.filter((event) => event.label.endsWith("started") && event.tone === "break").length;
  const washrooms = events.filter((event) => event.label === "Washroom").length;
  const meetings = events.filter((event) => event.label === "Meeting requested").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description={`${shiftWindowLabel()} · login through every break, washroom, and meeting`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Logins" value={logins} icon={LogIn} tone="success" />
        <StatCard label="Breaks" value={breaks} icon={Coffee} tone="warning" />
        <StatCard label="Washroom visits" value={washrooms} icon={Bath} tone="info" />
        <StatCard label="Meetings" value={meetings} icon={Users} />
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Radio}
              title="No activity this shift"
              description="Logins, tea, lunch, washroom, and meetings show here in order."
            />
          </CardContent>
        </Card>
      ) : (
        <ShiftTimeline events={events} showEmployee />
      )}
    </div>
  );
}
