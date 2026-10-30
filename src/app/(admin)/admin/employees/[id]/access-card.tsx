import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { describeAudit } from "@/lib/audit/describe";
import { formatDateTime } from "@/lib/format";
import { ResetMfaButton } from "./reset-mfa-button";

/** Access and security summary for one employee (Employee 360). */
export async function AccessCard({
  employeeId,
  authUserId,
  name,
  roleLabel,
  status,
  canReset,
}: {
  employeeId: string;
  authUserId: string | null;
  name: string;
  roleLabel: string;
  status: string;
  canReset: boolean;
}) {
  const service = createServiceClient();
  const [mfa, user, changes] = await Promise.all([
    authUserId ? service.rpc("has_verified_mfa", { p_user_id: authUserId }) : Promise.resolve({ data: false }),
    authUserId ? service.auth.admin.getUserById(authUserId) : Promise.resolve({ data: { user: null } }),
    service
      .from("audit_logs")
      .select("id, action, table_name, actor_employee_id, created_at")
      .eq("record_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);
  const actorIds = [...new Set((changes.data ?? []).map((c) => c.actor_employee_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await service.from("employees").select("id, full_name").in("id", actorIds)
    : { data: [] as { id: string; full_name: string }[] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.full_name]));
  const lastSignIn = user.data.user?.last_sign_in_at ?? null;
  const mfaOn = mfa.data === true;
  const blocked = status === "SUSPENDED" || status === "TERMINATED";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel
        id="access"
        title="Access & security"
        actions={canReset && mfaOn ? <ResetMfaButton employeeId={employeeId} name={name} /> : undefined}
      >
        <dl className="divide-y text-sm">
          <div className="flex items-center justify-between gap-3 px-5 py-2.5">
            <dt className="text-muted-foreground">Role</dt>
            <dd><Pill tone="neutral">{roleLabel}</Pill></dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-2.5">
            <dt className="text-muted-foreground">Sign-in</dt>
            <dd><Pill tone={blocked ? "danger" : authUserId ? "success" : "warning"}>{blocked ? "Blocked" : authUserId ? "Active" : "No account"}</Pill></dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-2.5">
            <dt className="text-muted-foreground">Two-factor sign-in</dt>
            <dd><Pill tone={mfaOn ? "success" : "warning"}>{mfaOn ? "On" : "Off"}</Pill></dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-5 py-2.5">
            <dt className="text-muted-foreground">Last sign-in</dt>
            <dd className="font-medium">{lastSignIn ? formatDateTime(lastSignIn) : "Never"}</dd>
          </div>
        </dl>
      </Panel>
      <Panel id="changes" title="Recent changes to this record" actions={<a href={`/admin/audit-logs`} className="text-[13px] font-medium text-primary hover:underline">Audit log</a>}>
        {(changes.data ?? []).length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <ul className="divide-y">
            {(changes.data ?? []).map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
                <span>{describeAudit(c.action, c.table_name)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {c.actor_employee_id ? actorName.get(c.actor_employee_id) ?? "Another user" : "System"} · {formatDateTime(c.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
