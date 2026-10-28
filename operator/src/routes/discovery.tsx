import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { DiscoveryView } from "@/components/discovery-view";

export const Route = createFileRoute("/discovery")({ component: DiscoveryPage });

function DiscoveryPage() {
  return (
    <Shell>
      <DiscoveryView />
    </Shell>
  );
}
