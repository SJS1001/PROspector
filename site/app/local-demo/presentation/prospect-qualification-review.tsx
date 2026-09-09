"use client";

import { useReducer } from "react";

/**
 * Development-only, fictional presentation leaves for the guarded local-demo
 * composition. They deliberately know nothing about routes, transport,
 * storage, or later authority seams. A parent must supply every displayed
 * value as a bounded fictional projection.
 */
export type FictionalEvidence = Readonly<{
  reference: string;
  sourceTier: 1 | 2 | 3;
  recency: "current" | "aging" | "stale";
  summary: string;
}>;

export type FictionalQualification = Readonly<{
  prospectReference: string;
  profileReference: string;
  score: number;
  outcome: "Passed" | "NotQualified" | "InsufficientEvidence" | "Disqualified";
  evidence: readonly FictionalEvidence[];
  hardGate: "clear" | "blocked";
  configurationDigest: string;
}>;

export type FictionalReviewState = "pending" | "approved" | "rejected" | "deferred";
export type FictionalReviewDecision = Exclude<FictionalReviewState, "pending">;

export type FictionalContactReadiness = Readonly<{
  uniqueProspectCount: number;
  eligibleContactPointCount: number;
  suggestionCount: number;
  nonContactableCount: number;
  suppressionState: "clear" | "blocked" | "unavailable";
  contactReadiness: "ContactReady" | "NeedsReview" | "NonContactable";
  verificationState: "fictional_preview_only" | "refused";
}>;

type ReviewAction =
  | Readonly<{ type: "select"; decision: FictionalReviewDecision }>
  | Readonly<{ type: "complete"; decision: FictionalReviewDecision }>;

function reviewReducer(state: FictionalReviewState, action: ReviewAction): FictionalReviewState {
  if (action.type === "select") return state === "pending" ? action.decision : state;
  return action.decision;
}

function validQualification(value: FictionalQualification): boolean {
  return Number.isSafeInteger(value.score)
    && value.score >= 0
    && value.score <= 10
    && value.prospectReference.length > 0
    && value.profileReference.length > 0
    && value.configurationDigest.length > 0
    && value.evidence.every((item) => item.reference.length > 0 && item.summary.length > 0);
}

function validReadiness(value: FictionalContactReadiness): boolean {
  return [
    value.uniqueProspectCount,
    value.eligibleContactPointCount,
    value.suggestionCount,
    value.nonContactableCount,
  ].every((count) => Number.isSafeInteger(count) && count >= 0)
    && value.eligibleContactPointCount <= value.uniqueProspectCount;
}

export function FictionalProspectQualificationReview({
  qualification,
}: Readonly<{
  qualification: FictionalQualification;
}>) {
  const [reviewState, dispatch] = useReducer(reviewReducer, "pending");
  const selectable = reviewState === "pending";
  const valid = validQualification(qualification);

  function decide(decision: FictionalReviewDecision) {
    if (!selectable || !valid || qualification.evidence.length === 0) return;
    dispatch({ type: "complete", decision });
  }

  if (!valid) {
    return <section aria-label="Fictional qualification review unavailable"><p role="alert">Fictional qualification projection unavailable.</p></section>;
  }

  return (
    <section className="local-demo-qualification-review" aria-labelledby="fictional-qualification-title">
      <p className="eyebrow">FICTIONAL · LOCAL_DEMO · NO EXTERNAL EFFECT</p>
      <h2 id="fictional-qualification-title">Prospect qualification review</h2>
      <p>
        This is a disposable presentation of a deterministic fictional assessment.
        It does not create a prospect, change a review record, or grant contact authority.
      </p>
      <dl>
        <dt>Prospect reference</dt><dd>{qualification.prospectReference}</dd>
        <dt>Profile reference</dt><dd>{qualification.profileReference}</dd>
        <dt>Deterministic score</dt><dd>{qualification.score} / 10</dd>
        <dt>Outcome</dt><dd>{qualification.outcome}</dd>
        <dt>Hard-gate result</dt><dd>{qualification.hardGate}</dd>
        <dt>Configuration digest</dt><dd>{qualification.configurationDigest}</dd>
      </dl>
      <h3>Evidence used for this fictional score</h3>
      {qualification.evidence.length ? (
        <ul>
          {qualification.evidence.map((item) => (
            <li key={item.reference}>
              <strong>{item.reference}</strong> · Tier {item.sourceTier} · {item.recency}: {item.summary}
            </li>
          ))}
        </ul>
      ) : <p>No fictional evidence was supplied; this projection cannot be reviewed.</p>}
      <fieldset>
        <legend>Fictional review outcome</legend>
        <p role="status" aria-live="polite">Current local state: {reviewState}.</p>
        <p>Review controls update this component’s local state only; they do not persist a decision.</p>
        {(["approved", "rejected", "deferred"] as const).map((decision) => (
          <button
            key={decision}
            type="button"
            disabled={!selectable || qualification.evidence.length === 0 || qualification.outcome !== "Passed"}
            onClick={() => decide(decision)}
          >
            Mark fictional review {decision}
          </button>
        ))}
      </fieldset>
    </section>
  );
}

export function FictionalContactReadyPreview({
  readiness,
  reviewState,
}: Readonly<{
  readiness: FictionalContactReadiness;
  reviewState: FictionalReviewState;
}>) {
  if (!validReadiness(readiness)) {
    return <section aria-label="Fictional ContactReady preview unavailable"><p role="alert">Fictional ContactReady preview unavailable.</p></section>;
  }
  const reviewApproved = reviewState === "approved";
  const contactReady = reviewApproved
    && readiness.contactReadiness === "ContactReady"
    && readiness.suppressionState === "clear"
    && readiness.verificationState === "fictional_preview_only";

  return (
    <section className="local-demo-contact-ready-preview" aria-labelledby="fictional-contact-ready-title">
      <p className="eyebrow">FICTIONAL · NOT A CONTACT DECISION</p>
      <h2 id="fictional-contact-ready-title">ContactReady-shaped preview</h2>
      <p>
        This preview distinguishes unique prospects from eligible contact points.
        It contains no contact values and cannot verify, retain, or use a contact.
      </p>
      <dl>
        <dt>Approved fictional review</dt><dd>{reviewApproved ? "yes" : "no"}</dd>
        <dt>Unique prospects</dt><dd>{readiness.uniqueProspectCount}</dd>
        <dt>Eligible contact points</dt><dd>{readiness.eligibleContactPointCount}</dd>
        <dt>Contact Suggestions</dt><dd>{readiness.suggestionCount} — not contactable</dd>
        <dt>Non-contactable references</dt><dd>{readiness.nonContactableCount}</dd>
        <dt>Suppression recheck</dt><dd>{readiness.suppressionState}</dd>
        <dt>Fictional contact state</dt><dd>{readiness.contactReadiness}</dd>
      </dl>
      <p role="status" aria-live="polite">
        {contactReady
          ? "ContactReady-shaped fictional projection only. No provider, persistence, or outreach authority exists."
          : "Contact readiness is refused or incomplete. No fictional contact is eligible for a later action."}
      </p>
      <button type="button" disabled aria-describedby="fictional-contact-action-reason">Continue to contact action</button>
      <p id="fictional-contact-action-reason">Disabled: this isolated preview has no contact, provider, persistence, package, message, suppression, or outreach authority.</p>
    </section>
  );
}
