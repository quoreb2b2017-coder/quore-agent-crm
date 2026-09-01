import { BookOpen } from "lucide-react";
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
import { CreatePolicyDialog } from "./create-policy-dialog";
import { requireSuperAdmin } from "@/lib/permissions/server";

export default async function WorkPoliciesPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: policies } = await supabase
    .from("work_policies")
    .select("id, name, description, is_active, rule_config")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Work Policies"
        description="Rules used to detect idle time and policy violations"
        actions={<CreatePolicyDialog />}
      />
      <Card>
        <CardContent>
          {!policies || policies.length === 0 ? (
            <EmptyState icon={BookOpen} title="No work policies yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.description ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={p.is_active ? "border-success/20 bg-success/10 text-success" : ""}
                      >
                        {p.is_active ? "Active" : "Inactive"}
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
