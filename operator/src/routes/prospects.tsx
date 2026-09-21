import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ProspectsView } from "@/components/prospects-view";

export const Route = createFileRoute("/prospects")({ component: ProspectsPage });

function ProspectsPage() {
  return (
    <Shell>
      <ProspectsView />
    </Shell>
  );
}
