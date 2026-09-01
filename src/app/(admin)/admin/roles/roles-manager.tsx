"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { setRolePermissions } from "./actions";

type Role = {
  id: string;
  role_key: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
};

type Permission = {
  id: string;
  permission_key: string;
  description: string | null;
  category: string | null;
};

export function RolesManager({
  roles,
  permissions,
  rolePermissions,
}: {
  roles: Role[];
  permissions: Permission[];
  rolePermissions: { role_id: string; permission_id: string }[];
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  const grantedByRole = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const rp of rolePermissions) {
      if (!map.has(rp.role_id)) map.set(rp.role_id, new Set());
      map.get(rp.role_id)!.add(rp.permission_id);
    }
    return map;
  }, [rolePermissions]);

  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(grantedByRole.get(selectedRoleId) ?? [])
  );

  function selectRole(roleId: string) {
    setSelectedRoleId(roleId);
    setChecked(new Set(grantedByRole.get(roleId) ?? []));
  }

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions) {
      const cat = p.category ?? "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return Array.from(map.entries());
  }, [permissions]);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);
  const isProtected = selectedRole?.role_key === "SUPER_ADMIN";

  function toggle(permId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const res = await setRolePermissions(selectedRoleId, Array.from(checked));
      if (res.error) toast.error(res.error);
      else toast.success("Permissions updated");
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
      <Card className="lg:col-span-1">
        <CardContent className="flex flex-col gap-1 p-2">
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => selectRole(role.id)}
              className={cn(
                "flex flex-col items-start rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                role.id === selectedRoleId && "bg-accent"
              )}
            >
              <span className="font-medium">{role.display_name}</span>
              <span className="text-xs text-muted-foreground">
                {grantedByRole.get(role.id)?.size ?? 0} permissions
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardContent>
          {!selectedRole ? (
            <p className="text-sm text-muted-foreground">No roles yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{selectedRole.display_name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedRole.description ?? selectedRole.role_key}
                  </p>
                </div>
                {isProtected ? (
                  <Badge variant="outline" className="gap-1">
                    <Lock className="size-3" />
                    Protected
                  </Badge>
                ) : (
                  <Button size="sm" onClick={save} disabled={isPending}>
                    {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Save Changes
                  </Button>
                )}
              </div>
              <Separator />
              {isProtected ? (
                <p className="text-sm text-muted-foreground">
                  Super Admin always has full access and cannot be restricted.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {grouped.map(([category, perms]) => (
                    <div key={category} className="flex flex-col gap-2">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                        {category}
                      </h4>
                      {perms.map((p) => (
                        <div key={p.id} className="flex items-start gap-2">
                          <Checkbox
                            id={p.id}
                            checked={checked.has(p.id)}
                            onCheckedChange={() => toggle(p.id)}
                          />
                          <Label htmlFor={p.id} className="flex flex-col font-normal">
                            <span>{p.permission_key}</span>
                            {p.description ? (
                              <span className="text-xs font-normal text-muted-foreground">
                                {p.description}
                              </span>
                            ) : null}
                          </Label>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
