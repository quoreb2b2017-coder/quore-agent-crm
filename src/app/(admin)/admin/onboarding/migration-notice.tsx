import { DatabaseZap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function MigrationNotice() {
  return (
    <Card className="py-0">
      <CardContent className="flex items-start gap-3 p-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning-foreground">
          <DatabaseZap className="size-4" />
        </span>
        <div className="text-sm">
          <p className="font-medium">Onboarding needs a one-time database update</p>
          <p className="mt-1 text-muted-foreground">
            Open the Supabase SQL Editor, paste{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">supabase/migrations/0022_onboarding.sql</code>{" "}
            and click Run. Then refresh this page.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
