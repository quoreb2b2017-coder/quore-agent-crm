import { Laptop } from "lucide-react";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requireSuperAdmin } from "@/lib/permissions/server";

export default async function DevicesPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: devices } = await supabase
    .from("devices")
    .select("id, employee_id, device_name, device_type, os, browser_extension_version, last_seen_at, is_active")
    .order("last_seen_at", { ascending: false })
    .limit(100);

  const employeeIds = Array.from(new Set((devices ?? []).map((d) => d.employee_id)));
  const { data: employees } =
    employeeIds.length > 0
      ? await supabase.from("employees").select("id, full_name").in("id", employeeIds)
      : { data: [] };
  const nameById = new Map((employees ?? []).map((e) => [e.id, e.full_name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Devices" description="Registered devices and Chrome Extension installs" />
      <Card>
        <CardContent>
          {!devices || devices.length === 0 ? (
            <EmptyState
              icon={Laptop}
              title="No devices registered yet"
              description="Devices appear here once employees install and connect the Chrome Extension."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>OS</TableHead>
                  <TableHead>Extension</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{nameById.get(d.employee_id) ?? "—"}</TableCell>
                    <TableCell>{d.device_name ?? d.device_type ?? "—"}</TableCell>
                    <TableCell>{d.os ?? "—"}</TableCell>
                    <TableCell>{d.browser_extension_version ?? "—"}</TableCell>
                    <TableCell>{d.last_seen_at ? formatDateTime(d.last_seen_at) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={d.is_active ? "border-success/20 bg-success/10 text-success" : ""}>
                        {d.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
