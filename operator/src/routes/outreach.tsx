import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { OutreachView } from "@/components/outreach-view";

export const Route = createFileRoute("/outreach")({ component: OutreachPage });

function OutreachPage() {
  return (
    <Shell>
      <OutreachView />
    </Shell>
  );
}
