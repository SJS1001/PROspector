/** Mirrors the review command's reason and defer-date checks before a click. */
export function normalizedReviewReason(reason: string) {
  return reason.normalize("NFC").trim();
}

export function reviewDecisionReady(reason: string) {
  return normalizedReviewReason(reason).length > 0;
}

export function deferDecisionReady(reason: string, reviewAt: string) {
  return reviewDecisionReady(reason) && Number.isFinite(Date.parse(reviewAt));
}

export function reviewDecisionHint(reason: string, reviewAt: string) {
  if (!reviewDecisionReady(reason)) {
    return "Enter a reason before you approve, reject, or save this for later.";
  }
  if (!deferDecisionReady(reason, reviewAt)) {
    return "Choose a review date before you save this for later.";
  }
  return null;
}

export function lockedTaskReason(unlock: string) {
  if (unlock === "interview") return "Finish company details first.";
  if (unlock === "product") return "Finish product details first.";
  if (unlock === "profile") return "Set up searches first.";
  if (unlock === "approved") return "Approve a prospect first.";
  return null;
}
