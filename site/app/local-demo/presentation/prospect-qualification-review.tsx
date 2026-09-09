"use client";

import { useId, useReducer } from "react";

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
  predecessorProspectReference: string;
  predecessorConfigurationDigest: string;
}>;

/** A local-only receipt emitted by the qualification leaf, never persisted. */
export type FictionalReviewReceipt = Readonly<{
  decision: FictionalReviewDecision;
  prospectReference: string;
  configurationDigest: string;
}>;

type ReviewAction =
  | Readonly<{ type: "select"; decision: FictionalReviewDecision }>
  | Readonly<{ type: "complete"; decision: FictionalReviewDecision }>;

function reviewReducer(state: FictionalReviewState, action: ReviewAction): FictionalReviewState {
  if (action.type === "select") return state === "pending" ? action.decision : state;
  return action.decision;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validEvidence(value: unknown): value is FictionalEvidence {
  try {
    return isRecord(value)
      && hasExactKeys(value, ["reference", "sourceTier", "recency", "summary"])
      && nonEmptyString(value.reference)
      && [1, 2, 3].includes(value.sourceTier as number)
      && ["current", "aging", "stale"].includes(value.recency as string)
      && nonEmptyString(value.summary);
  } catch {
    return false;
  }
}

function validQualification(value: unknown): value is FictionalQualification {
  try {
    return isRecord(value)
      && hasExactKeys(value, ["prospectReference", "profileReference", "score", "outcome", "evidence", "hardGate", "configurationDigest"])
      && Number.isSafeInteger(value.score)
      && value.score >= 0
      && value.score <= 10
      && nonEmptyString(value.prospectReference)
      && nonEmptyString(value.profileReference)
      && ["Passed", "NotQualified", "InsufficientEvidence", "Disqualified"].includes(value.outcome as string)
      && Array.isArray(value.evidence)
      && value.evidence.every(validEvidence)
      && ["clear", "blocked"].includes(value.hardGate as string)
      && nonEmptyString(value.configurationDigest);
  } catch {
    return false;
  }
}

function completeQualification(value: unknown): value is FictionalQualification {
  return validQualification(value)
    && value.evidence.length > 0
    && value.outcome === "Passed"
    && value.hardGate === "clear";
}

function validReadiness(value: unknown): value is FictionalContactReadiness {
  try {
    if (!isRecord(value)
      || !hasExactKeys(value, ["uniqueProspectCount", "eligibleContactPointCount", "suggestionCount", "nonContactableCount", "suppressionState", "contactReadiness", "verificationState", "predecessorProspectReference", "predecessorConfigurationDigest"])
      || !["clear", "blocked", "unavailable"].includes(value.suppressionState as string)
      || !["ContactReady", "NeedsReview", "NonContactable"].includes(value.contactReadiness as string)
      || !["fictional_preview_only", "refused"].includes(value.verificationState as string)
      || !nonEmptyString(value.predecessorProspectReference)
      || !nonEmptyString(value.predecessorConfigurationDigest)) return false;
    return [
      value.uniqueProspectCount,
      value.eligibleContactPointCount,
      value.suggestionCount,
      value.nonContactableCount,
    ].every((count) => Number.isSafeInteger(count) && count >= 0)
      && value.eligibleContactPointCount <= value.uniqueProspectCount;
  } catch {
    return false;
  }
}

function validReceipt(value: unknown): value is FictionalReviewReceipt {
  try {
    return isRecord(value)
      && hasExactKeys(value, ["decision", "prospectReference", "configurationDigest"])
      && ["approved", "rejected", "deferred"].includes(value.decision as string)
      && nonEmptyString(value.prospectReference)
      && nonEmptyString(value.configurationDigest);
  } catch {
    return false;
  }
}

export function FictionalProspectQualificationReview({
  qualification,
  onReviewDecision,
}: Readonly<{
  qualification: unknown;
  onReviewDecision?: (receipt: FictionalReviewReceipt) => void;
}>) {
  const [reviewState, dispatch] = useReducer(reviewReducer, "pending");
  const titleId = useId();
  const selectable = reviewState === "pending";
  const complete = completeQualification(qualification);

  function decide(decision: FictionalReviewDecision) {
    if (!selectable || !completeQualification(qualification)) return;
    dispatch({ type: "complete", decision });
    onReviewDecision?.(Object.freeze({
      decision,
      prospectReference: qualification.prospectReference,
      configurationDigest: qualification.configurationDigest,
    }));
  }

  if (!validQualification(qualification)) {
    return <section aria-label="Fictional qualification review unavailable"><p role="alert">Fictional qualification projection unavailable.</p></section>;
  }

  return (
    <section className="local-demo-qualification-review" aria-labelledby={titleId}>
      <p className="eyebrow">FICTIONAL · LOCAL_DEMO · NO EXTERNAL EFFECT</p>
      <h2 id={titleId}>Prospect qualification review</h2>
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
            disabled={!selectable || !complete}
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
  reviewReceipt,
}: Readonly<{
  readiness: unknown;
  reviewReceipt: unknown;
}>) {
  const titleId = useId();
  const actionReasonId = useId();
  if (!validReadiness(readiness)) {
    return <section aria-label="Fictional ContactReady preview unavailable"><p role="alert">Fictional ContactReady preview unavailable.</p></section>;
  }
  const reviewApproved = validReceipt(reviewReceipt)
    && reviewReceipt.decision === "approved"
    && reviewReceipt.prospectReference === readiness.predecessorProspectReference
    && reviewReceipt.configurationDigest === readiness.predecessorConfigurationDigest;
  const contactReady = reviewApproved
    && readiness.contactReadiness === "ContactReady"
    && readiness.suppressionState === "clear"
    && readiness.verificationState === "fictional_preview_only";

  return (
    <section className="local-demo-contact-ready-preview" aria-labelledby={titleId}>
      <p className="eyebrow">FICTIONAL · NOT A CONTACT DECISION</p>
      <h2 id={titleId}>ContactReady-shaped preview</h2>
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
      <button type="button" disabled aria-describedby={actionReasonId}>Continue to contact action</button>
      <p id={actionReasonId}>Disabled: this isolated preview has no contact, provider, persistence, package, message, suppression, or outreach authority.</p>
    </section>
  );
}
