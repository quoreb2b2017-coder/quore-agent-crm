import { UsersRound } from "lucide-react";
import { getCurrentEmployeeContext, hasPermission } from "@/lib/permissions/server";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateLeadDialog } from "./create-lead-dialog";
import { LeadStatusSelect } from "./lead-status-select";

export default async function LeadsPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const canManage = hasPermission(ctx, "leads.manage");

  const [{ data: leads }, { data: campaigns }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, full_name, email, phone, status, source")
      .order("created_at", { ascending: false }),
    supabase.from("campaigns").select("id, name").order("name"),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        description="Prospects and contacts"
        actions={canManage ? <CreateLeadDialog campaigns={campaigns ?? []} /> : undefined}
      />
      <Card>
        <CardContent>
          {!leads || leads.length === 0 ? (
            <EmptyState icon={UsersRound} title="No leads yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {l.email ?? l.phone ?? "—"}
                    </TableCell>
                    <TableCell>{l.source ?? "—"}</TableCell>
                    <TableCell>
                      {canManage ? (
                        <LeadStatusSelect leadId={l.id} status={l.status} />
                      ) : (
                        l.status
                      )}
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
