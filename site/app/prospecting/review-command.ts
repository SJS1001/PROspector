export type ReviewDraft = { reason: string; reviewAt: string };
export type ReviewDrafts = Record<string, ReviewDraft>;
export type ReviewCommandItem = {
  id: string;
  assessment_id: string;
  revision: number;
};

export const EMPTY_REVIEW_DRAFT: ReviewDraft = { reason: "", reviewAt: "" };

export function updateReviewDraft(
  drafts: ReviewDrafts,
  prospectId: string,
  patch: Partial<ReviewDraft>,
): ReviewDrafts {
  return {
    ...drafts,
    [prospectId]: {
      ...(drafts[prospectId] ?? EMPTY_REVIEW_DRAFT),
      ...patch,
    },
  };
}

export function buildReviewCommand(
  item: ReviewCommandItem,
  decision: "approve" | "reject" | "defer",
  draft: ReviewDraft,
): Record<string, unknown> | null {
  const reason = draft.reason.normalize("NFC").trim();
  if (!reason) return null;
  const reviewAt =
    decision === "defer" ? new Date(draft.reviewAt).getTime() : undefined;
  if (decision === "defer" && !Number.isFinite(reviewAt)) return null;
  return {
    action: "review",
    prospectId: item.id,
    assessmentId: item.assessment_id,
    expectedRevision: item.revision,
    decision,
    reason,
    ...(reviewAt === undefined ? {} : { reviewAt }),
  };
}
