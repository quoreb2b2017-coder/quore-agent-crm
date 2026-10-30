import { PageHeader } from "@/components/dashboard/page-header";
import { MfaManager } from "@/components/security/mfa-manager";
import { createServiceClient } from "@/lib/supabase/service";
import { getMfaStatus } from "@/lib/auth/mfa";
import { isManagement } from "@/lib/permissions/roles";
import { describeAudit, changedKeys } from "@/lib/audit/describe";
import { formatDateTime } from "@/lib/format";
import type { EmployeeContext } from "@/lib/permissions/types";

export async function AccountSecurity({ ctx }: { ctx: EmployeeContext }) {
  const service = createServiceClient();
  const [status, mine, aboutMe] = await Promise.all([
    getMfaStatus(),
    service
      .from("audit_logs")
      .select("id, action, table_name, old_data, new_data, created_at")
      .eq("actor_employee_id", ctx.employeeId)
      .order("created_at", { ascending: false })
      .limit(12),
    service
      .from("audit_logs")
      .select("id, action, table_name, actor_employee_id, old_data, new_data, created_at")
      .eq("table_name", "employees")
      .eq("record_id", ctx.employeeId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const actorIds = [...new Set((aboutMe.data ?? []).map((row) => row.actor_employee_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await service.from("employees").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`${ctx.employeeCode} · ${ctx.roleDisplayName}`}
        title="Account security"
        description="Protect your sign-in and see what has changed on your account."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <MfaManager required={isManagement(ctx.roleKey)} />
        <div className="flex flex-col gap-5">
          <section aria-labelledby="about-heading" className="rounded-xl border bg-card">
            <h2 id="about-heading" className="border-b px-5 py-3.5 text-base font-semibold">Changes to your record</h2>
            {(aboutMe.data ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No changes recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {(aboutMe.data ?? []).map((row) => {
                  const keys = changedKeys(row.old_data, row.new_data);
                  return (
                    <li key={row.id} className="px-5 py-3 text-sm">
                      <p className="font-medium">
                        {describeAudit(row.action, row.table_name)}
                        {keys.length ? <span className="font-normal text-muted-foreground"> · {keys.slice(0, 4).join(", ").replaceAll("_", " ")}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.actor_employee_id ? actorName.get(row.actor_employee_id) ?? "Another user" : "System"} · {formatDateTime(row.created_at)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section aria-labelledby="mine-heading" className="rounded-xl border bg-card">
            <h2 id="mine-heading" className="border-b px-5 py-3.5 text-base font-semibold">Changes you made</h2>
            {(mine.data ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">You have not changed any records yet.</p>
            ) : (
              <ul className="divide-y">
                {(mine.data ?? []).map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
                    <span>{describeAudit(row.action, row.table_name)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(row.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
              From the tamper-evident audit log. {status.aal === "aal2" ? "This session was verified with two-factor." : ""}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
