import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ProspectDetailView } from "@/components/prospects-view";

export const Route = createFileRoute("/prospects/$prospectId")({
  component: ProspectDetailPage,
});

function ProspectDetailPage() {
  const { prospectId } = Route.useParams();
  return (
    <Shell>
      <ProspectDetailView prospectId={prospectId} />
    </Shell>
  );
}
