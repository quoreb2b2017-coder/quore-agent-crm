"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setRolePermissions } from "./actions";

type Role = { id: string; role_key: string; display_name: string; is_system: boolean; members: number };
type Permission = { id: string; permission_key: string; description: string | null; category: string | null };

/** Pairs one role should not hold together (ISO A.5.3 segregation of duties). */
const CONFLICTS: { a: string; b: string; why: string }[] = [
  { a: "salary.manage", b: "payroll.manage", why: "can both set salaries and run payroll" },
  { a: "compliance.manage", b: "compliance.audit", why: "can both run controls and audit them" },
  { a: "employees.manage", b: "audit_logs.view", why: "can both change records and review the trail of those changes" },
];
const SUPER_ADMIN_ONLY = new Set(["roles.manage"]);

export function PermissionMatrix({
  roles,
  permissions,
  grants,
}: {
  roles: Role[];
  permissions: Permission[];
  grants: { role_id: string; permission_id: string }[];
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const initial = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const role of roles) map.set(role.id, new Set());
    for (const g of grants) map.get(g.role_id)?.add(g.permission_id);
    return map;
  }, [roles, grants]);
  const [draft, setDraft] = useState<Map<string, Set<string>>>(() => new Map([...initial].map(([k, v]) => [k, new Set(v)])));

  const keyById = useMemo(() => new Map(permissions.map((p) => [p.id, p.permission_key])), [permissions]);
  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions) {
      const key = p.category ?? "Other";
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  const changedRoles = roles.filter((role) => {
    const a = initial.get(role.id) ?? new Set();
    const b = draft.get(role.id) ?? new Set();
    return a.size !== b.size || [...a].some((id) => !b.has(id));
  });

  const conflicts = roles.flatMap((role) => {
    if (role.role_key === "SUPER_ADMIN") return [];
    const keys = new Set([...(draft.get(role.id) ?? [])].map((id) => keyById.get(id)));
    const list = CONFLICTS.filter((c) => keys.has(c.a) && keys.has(c.b)).map((c) => `${role.display_name} ${c.why}.`);
    for (const key of SUPER_ADMIN_ONLY) if (keys.has(key)) list.push(`${role.display_name} can manage roles, so it could grant itself anything. Keep this with Super Admin.`);
    return list;
  });

  function toggle(roleId: string, permissionId: string) {
    setDraft((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(roleId) ?? []);
      if (set.has(permissionId)) set.delete(permissionId);
      else set.add(permissionId);
      next.set(roleId, set);
      return next;
    });
  }

  function discard() {
    setDraft(new Map([...initial].map(([k, v]) => [k, new Set(v)])));
  }

  function save() {
    startSaving(async () => {
      for (const role of changedRoles) {
        const res = await setRolePermissions(role.id, [...(draft.get(role.id) ?? [])]);
        if (res.error) {
          toast.error(`${role.display_name}: ${res.error}`);
          return;
        }
      }
      toast.success(`Saved ${changedRoles.length} role${changedRoles.length === 1 ? "" : "s"}. Changes apply at each person's next sign-in.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {conflicts.length ? (
        <div role="alert" className="flex gap-3 rounded-xl border border-[#fecdca] bg-[#fef3f2] px-4 py-3.5 text-[#7a271a]">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#b42318]" aria-hidden />
          <div className="flex flex-col gap-1 text-[13px]">
            <b className="font-semibold">Separation of duties conflicts</b>
            {conflicts.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {changedRoles.length ? `${changedRoles.length} role${changedRoles.length === 1 ? "" : "s"} with unsaved changes.` : "Click a cell to grant or remove a permission."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!changedRoles.length || saving} onClick={discard}>Discard</Button>
          <Button className="bg-ink text-white hover:bg-ink/90" disabled={!changedRoles.length || saving} onClick={save}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-[260px] bg-[#f8faf9] px-5 py-3 text-left font-semibold">Permission</th>
              {roles.map((role) => (
                <th key={role.id} scope="col" className="min-w-[104px] px-2 py-3 text-center font-semibold">
                  <span className="inline-flex items-center gap-1">
                    {role.role_key === "SUPER_ADMIN" ? <Lock className="size-3 text-muted-foreground" aria-label="Locked" /> : null}
                    {role.display_name}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {role.members} {role.members === 1 ? "person" : "people"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([category, list]) => (
              <Fragment key={category}>
                <tr>
                  <th colSpan={roles.length + 1} scope="rowgroup" className="sticky left-0 bg-card px-5 pt-4 pb-1.5 text-left text-[11px] font-semibold tracking-[0.07em] text-muted-foreground uppercase">
                    {category}
                  </th>
                </tr>
                {list.map((perm) => (
                  <tr key={perm.id} className="border-t">
                    <th scope="row" className="sticky left-0 bg-card px-5 py-2 text-left font-normal">
                      {perm.description ?? perm.permission_key}
                      <span className="block font-mono text-[11px] text-muted-foreground">{perm.permission_key}</span>
                    </th>
                    {roles.map((role) => {
                      const locked = role.role_key === "SUPER_ADMIN";
                      const on = draft.get(role.id)?.has(perm.id) ?? false;
                      const was = initial.get(role.id)?.has(perm.id) ?? false;
                      const changed = on !== was;
                      return (
                        <td key={role.id} className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            disabled={locked || saving}
                            aria-pressed={on}
                            aria-label={`${perm.permission_key} for ${role.display_name}`}
                            onClick={() => toggle(role.id, perm.id)}
                            className={cn(
                              "inline-flex size-8 items-center justify-center rounded-md border transition",
                              on ? (locked ? "border-border bg-muted text-muted-foreground" : "border-[#bfebdd] bg-mint-soft text-primary") : "bg-card hover:bg-muted",
                              changed && "ring-2 ring-[#00a67e] ring-offset-1",
                              locked ? "cursor-not-allowed" : "cursor-pointer"
                            )}
                          >
                            {on ? <Check className="size-4" aria-hidden /> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        These grants drive database access and the claims in each person&apos;s sign-in token. Super Admin is locked here.
        Review who holds which role every quarter (ISO A.5.18, SOC 2 CC6.2). Every change is written to the audit log.
      </p>
    </div>
  );
}
