import { createFileRoute, Outlet, useMatch } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ProspectsView } from "@/components/prospects-view";

export const Route = createFileRoute("/prospects")({ component: ProspectsPage });

function ProspectsPage() {
  const detail = useMatch({ from: "/prospects/$prospectId", shouldThrow: false });
  if (detail) return <Outlet />;
  return (
    <Shell>
      <ProspectsView />
    </Shell>
  );
}
