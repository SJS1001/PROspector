import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ReviewView } from "@/components/review-view";

export const Route = createFileRoute("/review")({ component: ReviewPage });

function ReviewPage() {
  return (
    <Shell>
      <ReviewView />
    </Shell>
  );
}
