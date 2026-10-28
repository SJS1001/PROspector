import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { StatusView } from "@/components/status-view";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <Shell>
      <StatusView />
    </Shell>
  );
}
