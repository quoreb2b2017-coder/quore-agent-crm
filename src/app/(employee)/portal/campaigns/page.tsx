import { Megaphone } from "lucide-react";
import { getCurrentEmployeeContext, hasPermission } from "@/lib/permissions/server";
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
import { CreateCampaignDialog } from "./create-campaign-dialog";

const statusTone: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground border-transparent",
  ACTIVE: "bg-success/10 text-success border-success/20",
  PAUSED: "bg-warning/10 text-warning border-warning/20",
  COMPLETED: "bg-info/10 text-info border-info/20",
  CANCELLED: "bg-destructive/10 text-destructive border-destructive/20",
};

export default async function CampaignsPage() {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const canCreate = hasPermission(ctx, "campaigns.create");

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name, status, starts_on, ends_on, emails_processed")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Campaigns"
        description="Email marketing campaigns"
        actions={canCreate ? <CreateCampaignDialog /> : undefined}
      />
      <Card>
        <CardContent>
          {!campaigns || campaigns.length === 0 ? (
            <EmptyState icon={Megaphone} title="No campaigns yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>Emails Processed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusTone[c.status]}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.starts_on ?? "—"} – {c.ends_on ?? "—"}
                    </TableCell>
                    <TableCell>{c.emails_processed}</TableCell>
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
