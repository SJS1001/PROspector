/**
 * Fictional, presentation-only LOCAL_DEMO outreach review.
 *
 * This deliberately receives its entire story as typed props. It has no
 * mutation callback, transport, persistence, integration boundary, or navigation
 * target. A later LOCAL_DEMO composition task may choose to render it after
 * the earlier fictional Profile, Prospect, and Contact projections are ready.
 */

export type FictionalApprovalState = "approved" | "waiting" | "invalidated";

export type FictionalPackageApproval = {
  label: string;
  digest: string;
  state: FictionalApprovalState;
  invalidationReason?: string;
};

export type FictionalMessageApproval = {
  label: string;
  digest: string;
  packageDigest: string;
  state: FictionalApprovalState;
  invalidationReason?: string;
};

export type FictionalCurrentSuppression = {
  subjectLabel: string;
  state: "clear" | "suppressed" | "recheck_required";
  digest: string;
  reason?: string;
};

export type LocalDemoOutreachApprovalPreviewProps = {
  packageApproval: FictionalPackageApproval;
  messageApproval: FictionalMessageApproval;
  currentSuppression: FictionalCurrentSuppression;
};

function approvalCopy(state: FictionalApprovalState, invalidationReason?: string) {
  if (state === "approved") return "Approved in this fictional preview.";
  if (state === "invalidated") return `Invalidated${invalidationReason ? `: ${invalidationReason}` : "."}`;
  return "Waiting for the earlier fictional approval.";
}

function suppressionCopy(suppression: FictionalCurrentSuppression) {
  if (suppression.state === "clear") return "Current fictional recheck is clear.";
  if (suppression.state === "suppressed") return `Suppressed${suppression.reason ? `: ${suppression.reason}` : "."}`;
  return "A current fictional suppression recheck is still required.";
}

/** Renders only a review record. The disabled controls are labels for absent
 * authority, never actions: there is no handler or effect seam in this module. */
export function LocalDemoOutreachApprovalPreview({
  packageApproval,
  messageApproval,
  currentSuppression,
}: LocalDemoOutreachApprovalPreviewProps) {
  const messageMatchesPackage = messageApproval.packageDigest === packageApproval.digest;
  const messageMayBeReviewed = packageApproval.state === "approved" && messageMatchesPackage;
  const noEffectLabel = "Disabled — fictional preview only; no Gmail, phone, provider, persistence, or outbound effect is available.";

  return (
    <section className="local-demo-outreach-preview" aria-labelledby="local-demo-outreach-preview-title">
      <header>
        <span>LOCAL_DEMO · FICTIONAL · ZERO EFFECT</span>
        <h2 id="local-demo-outreach-preview-title">Outreach approval and suppression preview</h2>
        <p>
          A later composition may display this fixed, fictional review record.
          It cannot send, call, save, export, copy, or contact anyone.
        </p>
      </header>

      <ol aria-label="Fictional outreach review order" className="local-demo-outreach-review-order">
        <li>
          <h3>1. Package approval</h3>
          <p>{approvalCopy(packageApproval.state, packageApproval.invalidationReason)}</p>
          <dl>
            <div><dt>Fictional package</dt><dd>{packageApproval.label}</dd></div>
            <div><dt>Package digest</dt><dd>{packageApproval.digest}</dd></div>
          </dl>
        </li>
        <li data-message-review-blocked={!messageMayBeReviewed || undefined}>
          <h3>2. Message approval</h3>
          <p>
            {messageMayBeReviewed
              ? approvalCopy(messageApproval.state, messageApproval.invalidationReason)
              : "Not reviewable: the exact fictional Package must be approved first and match this Message's Package digest."}
          </p>
          <dl>
            <div><dt>Fictional message</dt><dd>{messageApproval.label}</dd></div>
            <div><dt>Message digest</dt><dd>{messageApproval.digest}</dd></div>
            <div><dt>Bound Package digest</dt><dd>{messageApproval.packageDigest}</dd></div>
          </dl>
        </li>
        <li>
          <h3>3. Current suppression recheck</h3>
          <p>{suppressionCopy(currentSuppression)}</p>
          <dl>
            <div><dt>Fictional subject</dt><dd>{currentSuppression.subjectLabel}</dd></div>
            <div><dt>Suppression digest</dt><dd>{currentSuppression.digest}</dd></div>
          </dl>
        </li>
      </ol>

      <fieldset className="local-demo-outreach-disabled-actions">
        <legend>Effect controls remain unavailable</legend>
        <p id="local-demo-gmail-disabled-copy">{noEffectLabel}</p>
        <button type="button" disabled aria-describedby="local-demo-gmail-disabled-copy">Send with Gmail</button>
        <p id="local-demo-call-disabled-copy">{noEffectLabel}</p>
        <button type="button" disabled aria-describedby="local-demo-call-disabled-copy">Click-to-call</button>
      </fieldset>
    </section>
  );
}
