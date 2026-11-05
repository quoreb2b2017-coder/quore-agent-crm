"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, Lock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
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

const frozenClassName = "sticky left-0 min-w-64";

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
  const [query, setQuery] = useState("");
  const initial = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const role of roles) map.set(role.id, new Set());
    for (const g of grants) map.get(g.role_id)?.add(g.permission_id);
    return map;
  }, [roles, grants]);
  const [draft, setDraft] = useState<Map<string, Set<string>>>(() => new Map([...initial].map(([k, v]) => [k, new Set(v)])));

  const keyById = useMemo(() => new Map(permissions.map((p) => [p.id, p.permission_key])), [permissions]);
  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const map = new Map<string, Permission[]>();
    for (const p of permissions) {
      const key = p.category ?? "Other";
      if (needle && !`${key} ${p.description ?? ""} ${p.permission_key}`.toLowerCase().includes(needle)) continue;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions, query]);

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
    <section className="border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Permissions</h2>
          <p className={cn("text-xs", changedRoles.length ? "font-semibold text-warning" : "text-muted-foreground")}>
            {changedRoles.length
              ? `${changedRoles.length} role${changedRoles.length === 1 ? "" : "s"} with unsaved changes`
              : "Click a cell to grant or remove a permission, then save"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search permissions"
              aria-label="Search permissions"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rounded-sm bg-card pl-8"
            />
          </div>
          <Button size="sm" variant="outline" className="rounded-sm bg-card" disabled={!changedRoles.length || saving} onClick={discard}>
            Discard
          </Button>
          <Button size="sm" className="rounded-sm" disabled={!changedRoles.length || saving} onClick={save}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </div>
      </div>

      {conflicts.length ? (
        <div role="alert" className="flex gap-2.5 border-b bg-destructive/10 px-3 py-2 text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex flex-col gap-0.5 text-[13px]">
            <b className="font-semibold">Separation of duties conflicts</b>
            {conflicts.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">No permission matches this search.</p>
      ) : (
        <div className="[&>[data-slot=table-container]]:max-h-[calc(100svh-16rem)]">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(sheetHeadClassName, frozenClassName, "z-[2]")}>Permission</TableHead>
                {roles.map((role, index) => (
                  <TableHead
                    key={role.id}
                    className={cn(
                      sheetHeadClassName,
                      "h-auto min-w-28 py-1.5 text-center",
                      index === roles.length - 1 && "border-r-0"
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {role.role_key === "SUPER_ADMIN" ? <Lock className="size-3" aria-label="Locked" /> : null}
                      {role.display_name}
                    </span>
                    <span className="block text-[11px] font-normal tracking-normal normal-case opacity-70">
                      {draft.get(role.id)?.size ?? 0} of {permissions.length}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([category, list]) => (
                <Fragment key={category}>
                  <TableRow className="bg-secondary hover:bg-secondary">
                    <TableCell
                      colSpan={roles.length + 1}
                      className={cn(sheetCellClassName, "h-8 border-r-0 text-[11px] font-bold tracking-wider uppercase")}
                    >
                      <span className="sticky left-3">
                        {category} · {list.length}
                      </span>
                    </TableCell>
                  </TableRow>
                  {list.map((perm) => (
                    <TableRow key={perm.id} className={sheetRowClassName}>
                      <TableCell className={cn(sheetCellClassName, frozenClassName, "z-[1] bg-inherit whitespace-normal")}>
                        <span className="block font-medium">{perm.description ?? perm.permission_key}</span>
                        <span className="block font-mono text-[11px] text-muted-foreground">{perm.permission_key}</span>
                      </TableCell>
                      {roles.map((role, index) => {
                        const locked = role.role_key === "SUPER_ADMIN";
                        const on = draft.get(role.id)?.has(perm.id) ?? false;
                        const was = initial.get(role.id)?.has(perm.id) ?? false;
                        const changed = on !== was;
                        return (
                          <TableCell
                            key={role.id}
                            className={cn(
                              sheetCellClassName,
                              "px-1 text-center",
                              changed && "bg-warning/10",
                              index === roles.length - 1 && "border-r-0"
                            )}
                          >
                            <button
                              type="button"
                              disabled={locked || saving}
                              aria-pressed={on}
                              aria-label={`${perm.permission_key} for ${role.display_name}`}
                              onClick={() => toggle(role.id, perm.id)}
                              className={cn(
                                "inline-flex size-7 items-center justify-center rounded-sm border transition-colors",
                                on
                                  ? locked
                                    ? "border-border bg-muted text-muted-foreground"
                                    : "border-primary bg-primary text-primary-foreground"
                                  : "bg-card hover:bg-accent",
                                changed && "ring-2 ring-warning ring-offset-1",
                                locked ? "cursor-not-allowed" : "cursor-pointer"
                              )}
                            >
                              {on ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
                            </button>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex size-4 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <Check className="size-3" strokeWidth={3} aria-hidden />
          </span>
          Granted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-sm border bg-card" aria-hidden />
          Not granted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-sm border bg-card ring-2 ring-warning" aria-hidden />
          Unsaved
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3" aria-hidden />
          Super Admin is locked
        </span>
        <span className="sm:ml-auto">
          Every change is written to the audit log. Review who holds which role every quarter (ISO A.5.18, SOC 2 CC6.2).
        </span>
      </div>
    </section>
  );
}
