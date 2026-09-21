import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { SettingsView } from "@/components/settings-view";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <Shell>
      <SettingsView />
    </Shell>
  );
}
