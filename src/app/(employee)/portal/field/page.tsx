import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export default function FieldWorkPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Field Work" description="Assigned visits and check-ins" />
      <Card>
        <CardContent>
          <EmptyState
            icon={MapPin}
            title="Field visit tracking is coming soon"
            description="Assigned visits, check-ins, and location-based work features are planned for a follow-up phase. Use My Tasks in the meantime for assigned field work."
          />
        </CardContent>
      </Card>
    </div>
  );
}
