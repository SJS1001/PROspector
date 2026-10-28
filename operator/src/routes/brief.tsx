import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { BriefView } from "@/components/brief-view";

export const Route = createFileRoute("/brief")({ component: BriefPage });

function BriefPage() {
  return (
    <Shell>
      <BriefView />
    </Shell>
  );
}
