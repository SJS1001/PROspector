import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { KnowledgeView } from "@/components/knowledge-view";

export const Route = createFileRoute("/knowledge")({ component: KnowledgePage });

function KnowledgePage() {
  return (
    <Shell>
      <KnowledgeView />
    </Shell>
  );
}
