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

export const REVIEW_DATE_IN_PAST =
  "Choose a review date in the future. The prospect was not deferred.";

/** Earliest selectable datetime-local value: the next whole minute after now, in local time. */
export function minimumReviewAt(now: number): string {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}

/** Client-side validation only; the server remains the authority for reviewAt. */
export function reviewDateError(
  decision: "approve" | "reject" | "defer",
  draft: ReviewDraft,
  now: number,
): string | null {
  if (decision !== "defer" || !draft.reviewAt) return null;
  const reviewAt = new Date(draft.reviewAt).getTime();
  if (!Number.isFinite(reviewAt)) return null;
  return reviewAt <= now ? REVIEW_DATE_IN_PAST : null;
}

export function buildReviewCommand(
  item: ReviewCommandItem,
  decision: "approve" | "reject" | "defer",
  draft: ReviewDraft,
  now: number = Date.now(),
): Record<string, unknown> | null {
  const reason = draft.reason.normalize("NFC").trim();
  if (!reason) return null;
  const reviewAt =
    decision === "defer" ? new Date(draft.reviewAt).getTime() : undefined;
  if (decision === "defer" && !Number.isFinite(reviewAt)) return null;
  if (reviewDateError(decision, draft, now)) return null;
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
