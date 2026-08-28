import {
  buildSyntheticOutreachPackage,
  type SyntheticOutreachPackageArtifact,
} from "./outreach-artifacts";

type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

type Artifact = Readonly<{ id: string; digest: string }>;
type PackageApproval = Readonly<{
  id: string;
  packageId: string;
  packageDigest: string;
  approvedAt: number;
  expiresAt: number;
  active: boolean;
}>;
type VerifiedPhone = Readonly<{
  id: string;
  normalizedNumber: string;
  verificationClass: "source_verified";
  method: "authoritative_source_reconfirmed";
  verificationEvidenceDigest: string;
  sourceReferenceDigest: string;
  verifiedAt: number;
  freshUntil: number;
}>;
type Advisory = Readonly<{
  acknowledgementId: string;
  jurisdictionId: string;
  basisEvidenceDigest: string;
  acknowledgedAt: number;
  expiresAt: number;
}>;
type CallScript = Readonly<{
  opening: string;
  evidenceHashes: readonly string[];
  claimGuardrailVersionIds: readonly string[];
  digest: string;
}>;
type ManualCallCandidateSnapshot = Readonly<{
  id: string;
  callSessionId: string;
  workspaceId: string;
  companyId: string;
  prospectId: string;
  contactId: string;
  organizationId: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  packageArtifact: Artifact;
  packageApproval: PackageApproval;
  callScript: CallScript;
  selectedPhone: VerifiedPhone;
  advisory: Advisory;
  suppressionSubjectIds: readonly string[];
  matchingPendingWorkIds: readonly string[];
  cancellationDependencyIds: readonly string[];
  createdAt: number;
}>;
type ManualOutcome = "connected" | "voicemail" | "no_answer" | "wrong_number" | "do_not_call" | "follow_up";
type OutcomeSubmission = Readonly<{
  id: string;
  activityId: string;
  suppressionTombstoneId: string | null;
  cancellationRecordId: string | null;
  operatorAttestationId: string;
  outcome: ManualOutcome;
  notes: string;
  submittedAt: number;
}>;
type SuppressionSubject = Readonly<{ kind: "exact_phone"; value: string; channel: "phone" }>;

export type SyntheticManualCallCandidate = Readonly<{
  kind: "synthetic_manual_call_candidate";
  id: string;
  digest: string;
  snapshot: ManualCallCandidateSnapshot;
  phoneTargetAuthorized: false;
  activityPersistenceAuthorized: false;
  suppressionPersistenceAuthorized: false;
  followUpCreationAuthorized: false;
  phoneEffectAuthorized: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const SYNTHETIC_PHONE = /^\+1\d{3}55501\d{2}$/u;
const OUTCOMES = new Set<ManualOutcome>([
  "connected", "voicemail", "no_answer", "wrong_number", "do_not_call", "follow_up",
]);
const candidateArtifacts = new WeakSet<object>();
const eligibilityDecisions = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/**
 * Canonicalizes a fictional manual-call candidate and derives its script from
 * the canonical Package. It creates no target, activity, suppression, or
 * phone effect and is intentionally unreachable from application runtime.
 */
export async function buildSyntheticManualCallCandidate(
  value: unknown,
): Promise<SyntheticManualCallCandidate> {
  try {
    const input = exactRecord(value, [
      "id", "callSessionId", "organizationId", "package", "packageApproval", "selectedPhoneId",
      "phoneVerification", "advisory", "suppressionSubjectIds", "matchingPendingWorkIds",
      "cancellationDependencyIds", "createdAt",
    ]);
    const packageArtifact = await buildSyntheticOutreachPackage(input.package);
    if (!syntheticOnlyText(packageArtifact.callScript.opening)) invalid();
    const createdAt = timestamp(input.createdAt);
    const selectedPhoneId = syntheticId(input.selectedPhoneId);
    const selectedPoint = packageArtifact.snapshot.selectedContactPoints.find((point) => point.id === selectedPhoneId);
    if (!selectedPoint
      || selectedPoint.kind !== "phone"
      || selectedPoint.verificationClass !== "source_verified") invalid();
    const verification = normalizeVerification(input.phoneVerification);
    if (verification.freshUntil !== selectedPoint.freshUntil
      || verification.verifiedAt > createdAt
      || verification.freshUntil <= createdAt) invalid();
    const approvalInput = exactRecord(input.packageApproval, ["id", "approvedAt", "expiresAt"]);
    const approvedAt = timestamp(approvalInput.approvedAt);
    const approvalExpiresAt = timestamp(approvalInput.expiresAt);
    if (approvedAt < packageArtifact.snapshot.createdAt || approvedAt > createdAt || approvalExpiresAt <= createdAt) invalid();
    const advisory = normalizeAdvisory(input.advisory);
    if (advisory.acknowledgedAt > createdAt || advisory.expiresAt <= createdAt) invalid();
    const snapshot: ManualCallCandidateSnapshot = deepFreeze({
      id: syntheticId(input.id),
      callSessionId: syntheticId(input.callSessionId),
      workspaceId: packageArtifact.snapshot.workspaceId,
      companyId: packageArtifact.snapshot.companyId,
      prospectId: packageArtifact.snapshot.prospectId,
      contactId: packageArtifact.snapshot.contactId,
      organizationId: syntheticId(input.organizationId),
      profileConfigurationId: packageArtifact.snapshot.profileConfigurationId,
      profileConfigurationDigest: packageArtifact.snapshot.profileConfigurationDigest,
      packageArtifact: deepFreeze({ id: packageArtifact.id, digest: packageArtifact.digest }),
      packageApproval: deepFreeze({
        id: syntheticId(approvalInput.id),
        packageId: packageArtifact.id,
        packageDigest: packageArtifact.digest,
        approvedAt,
        expiresAt: approvalExpiresAt,
        active: true,
      }),
      callScript: copyCallScript(packageArtifact),
      selectedPhone: deepFreeze({
        id: selectedPoint.id,
        normalizedNumber: syntheticPhone(selectedPoint.value),
        ...verification,
      }),
      advisory,
      suppressionSubjectIds: sortedUnique(input.suppressionSubjectIds, 1, 32),
      matchingPendingWorkIds: sortedUnique(input.matchingPendingWorkIds, 0, 64),
      cancellationDependencyIds: sortedUnique(input.cancellationDependencyIds, 1, 64),
      createdAt,
    });
    const artifact: SyntheticManualCallCandidate = deepFreeze({
      kind: "synthetic_manual_call_candidate",
      id: snapshot.id,
      digest: await sha256(JSON.stringify(snapshot)),
      snapshot,
      phoneTargetAuthorized: false,
      activityPersistenceAuthorized: false,
      suppressionPersistenceAuthorized: false,
      followUpCreationAuthorized: false,
      phoneEffectAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    candidateArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_manual_call_candidate_invalid");
  }
}

/**
 * Projects current eligibility without creating a browser target or claiming
 * that any human interaction occurred.
 */
export async function evaluateSyntheticManualCallEligibility(value: unknown) {
  try {
    const input = exactRecord(value, ["candidateArtifact", "currentCandidate", "currentAuthority"]);
    if (!candidateArtifacts.has(input.candidateArtifact as object)) invalid();
    const candidate = input.candidateArtifact as SyntheticManualCallCandidate;
    const currentCandidate = await buildSyntheticManualCallCandidate(input.currentCandidate);
    const current = normalizeAuthority(input.currentAuthority);
    const reasons = collectIntegrityReasons(candidate, currentCandidate, current);
    reasons.push(...collectAvailabilityReasons(candidate, current));
    const rejected = reasons.length > 0;
    const decision = deepFreeze({
      kind: "synthetic_manual_call_eligibility_decision" as const,
      status: rejected
        ? "synthetic_manual_call_rejected" as const
        : "synthetic_manual_call_eligible_no_authority" as const,
      candidateDigest: candidate.digest,
      checkedAt: current.evaluatedAt,
      eligibleForManualCall: !rejected,
      phoneTargetProjection: null,
      activityProjection: null,
      scriptProjection: rejected ? null : candidate.snapshot.callScript,
      reasonCodes: [...new Set(reasons)].sort(),
      phoneTargetAuthorized: false as const,
      activityPersistenceAuthorized: false as const,
      suppressionPersistenceAuthorized: false as const,
      followUpCreationAuthorized: false as const,
      phoneEffectAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
    eligibilityDecisions.add(decision);
    return decision;
  } catch {
    throw new Error("synthetic_manual_call_eligibility_invalid");
  }
}

/**
 * Describes the durable ordering a future trusted outcome transaction must
 * enforce. It cannot write the activity, suppression, cancellation, or any
 * follow-up and it never creates a phone effect.
 */
export async function evaluateSyntheticManualCallOutcome(value: unknown) {
  try {
    const input = exactRecord(value, [
      "candidateArtifact", "eligibilityDecision", "currentCandidate", "currentAuthority", "submission", "durableState",
    ]);
    if (!candidateArtifacts.has(input.candidateArtifact as object)
      || !eligibilityDecisions.has(input.eligibilityDecision as object)) invalid();
    const candidate = input.candidateArtifact as SyntheticManualCallCandidate;
    const priorDecision = input.eligibilityDecision as {
      status: string;
      candidateDigest: string;
      checkedAt: number;
    };
    if (priorDecision.status !== "synthetic_manual_call_eligible_no_authority"
      || priorDecision.candidateDigest !== candidate.digest) invalid();
    const currentCandidate = await buildSyntheticManualCallCandidate(input.currentCandidate);
    const current = normalizeAuthority(input.currentAuthority);
    const submission = normalizeSubmission(input.submission);
    const durable = normalizeDurableState(input.durableState);
    const reasons = collectIntegrityReasons(candidate, currentCandidate, current);
    if (submission.submittedAt < candidate.snapshot.createdAt
      || submission.submittedAt < priorDecision.checkedAt
      || submission.submittedAt > current.evaluatedAt) reasons.push("outcome_submission_time_invalid");
    if (submission.outcome === "follow_up") reasons.push(...collectAvailabilityReasons(candidate, current));

    const notesDigest = await sha256(submission.notes);
    const outcomeIntentDigest = await sha256(JSON.stringify({
      candidateDigest: candidate.digest,
      id: submission.id,
      activityId: submission.activityId,
      suppressionTombstoneId: submission.suppressionTombstoneId,
      cancellationRecordId: submission.cancellationRecordId,
      operatorAttestationId: submission.operatorAttestationId,
      outcome: submission.outcome,
      notesDigest,
      submittedAt: submission.submittedAt,
    }));
    const activityProjection = deepFreeze({
      id: submission.activityId,
      candidateDigest: candidate.digest,
      outcome: submission.outcome,
      notesDigest,
    });
    const requiredSuppressionSubject: SuppressionSubject | null = submission.outcome === "do_not_call"
      ? deepFreeze({ kind: "exact_phone", value: candidate.snapshot.selectedPhone.normalizedNumber, channel: "phone" })
      : null;

    if (submission.outcome === "do_not_call") {
      validateDoNotCallDurability({
        candidate,
        submission,
        durable,
        current,
        outcomeIntentDigest,
        notesDigest,
        requiredSuppressionSubject: requiredSuppressionSubject as SuppressionSubject,
        reasons,
      });
    } else {
      validateOrdinaryDurability({
        candidate, submission, durable, current, outcomeIntentDigest, notesDigest, reasons,
      });
    }

    const pristine = durable.suppressionRecord === null
      && durable.cancellationRecord === null
      && durable.activityRecord === null;
    const durableComplete = submission.outcome === "do_not_call"
      ? durable.suppressionRecord !== null && durable.cancellationRecord !== null && durable.activityRecord !== null
      : durable.suppressionRecord === null && durable.cancellationRecord === null && durable.activityRecord !== null;
    const rejected = reasons.length > 0;
    const commitRequired = !rejected && pristine;
    const alreadyDurable = !rejected && durableComplete;
    const requiredOrderedSteps = !commitRequired
      ? []
      : submission.outcome === "do_not_call"
        ? [
            "append_exact_phone_suppression",
            "cancel_matching_pending_or_unleased_work",
            "record_manual_call_activity",
          ] as const
        : submission.outcome === "follow_up"
          ? ["record_manual_call_activity", "require_new_follow_up_version_and_approval"] as const
          : ["record_manual_call_activity"] as const;
    return deepFreeze({
      kind: "synthetic_manual_call_outcome_decision" as const,
      status: rejected
        ? "synthetic_manual_call_outcome_rejected" as const
        : alreadyDurable
          ? "synthetic_manual_call_outcome_already_durable_no_authority" as const
          : "synthetic_manual_call_outcome_commit_required_no_authority" as const,
      candidateDigest: candidate.digest,
      outcomeIntentDigest,
      outcome: submission.outcome,
      activityProjection,
      requiredSuppressionSubject: rejected ? null : requiredSuppressionSubject,
      requiredCancellationWorkIds: commitRequired && submission.outcome === "do_not_call"
        ? candidate.snapshot.matchingPendingWorkIds
        : [],
      requiredOrderedSteps,
      newFollowUpVersionRequired: !rejected && submission.outcome === "follow_up",
      suppressionPrecedesActivity: !rejected && alreadyDurable && submission.outcome === "do_not_call",
      reasonCodes: [...new Set(reasons)].sort(),
      phoneTargetAuthorized: false as const,
      activityPersistenceAuthorized: false as const,
      suppressionPersistenceAuthorized: false as const,
      followUpCreationAuthorized: false as const,
      phoneEffectAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_manual_call_outcome_invalid");
  }
}

function collectIntegrityReasons(
  candidate: SyntheticManualCallCandidate,
  currentCandidate: SyntheticManualCallCandidate,
  current: ReturnType<typeof normalizeAuthority>,
) {
  const snapshot = candidate.snapshot;
  const reasons: string[] = [];
  if (currentCandidate.digest !== candidate.digest) reasons.push("manual_call_candidate_changed");
  if (current.workspaceId !== snapshot.workspaceId) reasons.push("workspace_scope_mismatch");
  if (current.companyId !== snapshot.companyId) reasons.push("company_scope_mismatch");
  if (current.prospectId !== snapshot.prospectId) reasons.push("prospect_scope_mismatch");
  if (current.contactId !== snapshot.contactId) reasons.push("contact_scope_mismatch");
  if (current.organizationId !== snapshot.organizationId) reasons.push("organization_scope_mismatch");
  if (current.profileConfigurationId !== snapshot.profileConfigurationId
    || current.profileConfigurationDigest !== snapshot.profileConfigurationDigest) {
    reasons.push("profile_configuration_changed");
  }
  if (!sameArtifact(current.packageArtifact, snapshot.packageArtifact)) reasons.push("package_artifact_changed");
  if (current.callScriptDigest !== snapshot.callScript.digest) reasons.push("call_script_changed");
  if (!sameApproval(current.packageApproval, snapshot.packageApproval)) reasons.push("package_approval_changed");
  if (!samePhone(current.selectedPhone, snapshot.selectedPhone)) reasons.push("verified_phone_changed");
  if (!sameAdvisory(current.advisory, snapshot.advisory)) reasons.push("advisory_acknowledgement_changed");
  if (!sameStrings(current.suppressionSubjectIds, snapshot.suppressionSubjectIds)) {
    reasons.push("suppression_subject_set_changed");
  }
  if (!sameStrings(current.matchingPendingWorkIds, snapshot.matchingPendingWorkIds)) {
    reasons.push("matching_work_set_changed");
  }
  if (!sameStrings(current.cancellationDependencyIds, snapshot.cancellationDependencyIds)) {
    reasons.push("cancellation_dependency_set_changed");
  }
  if (current.evaluatedAt < snapshot.createdAt) reasons.push("evaluation_precedes_candidate");
  return reasons;
}

function collectAvailabilityReasons(
  candidate: SyntheticManualCallCandidate,
  current: ReturnType<typeof normalizeAuthority>,
) {
  const reasons: string[] = [];
  if (!current.packageApproval.active) reasons.push("package_approval_inactive");
  if (current.packageApproval.expiresAt <= current.evaluatedAt) reasons.push("package_approval_expired");
  if (current.selectedPhone.verifiedAt > current.evaluatedAt) reasons.push("verified_phone_time_invalid");
  if (current.selectedPhone.freshUntil <= current.evaluatedAt) reasons.push("verified_phone_stale");
  if (current.advisory.acknowledgedAt > current.evaluatedAt) reasons.push("advisory_acknowledgement_time_invalid");
  if (current.advisory.expiresAt <= current.evaluatedAt) reasons.push("advisory_acknowledgement_expired");
  if (!current.profileAvailable) reasons.push("profile_unavailable");
  if (!current.prospectApproved) reasons.push("prospect_not_approved");
  if (!current.contactReady) reasons.push("contact_not_ready");
  if (!current.packageAvailable) reasons.push("package_unavailable");
  if (!current.phoneAvailable) reasons.push("phone_unavailable");
  if (current.paused) reasons.push("outreach_paused");
  if (current.archived) reasons.push("outreach_archived");
  if (current.highRiskDrift) reasons.push("high_risk_drift");
  if (current.suppressionBlocked) reasons.push("suppression_blocked");
  if (current.stopReasonIds.length > 0) reasons.push("stop_rule_active");
  if (candidate.snapshot.selectedPhone.verificationClass !== "source_verified"
    || candidate.snapshot.selectedPhone.method !== "authoritative_source_reconfirmed") {
    reasons.push("verified_phone_ineligible");
  }
  return reasons;
}

function validateDoNotCallDurability(input: Readonly<{
  candidate: SyntheticManualCallCandidate;
  submission: OutcomeSubmission;
  durable: ReturnType<typeof normalizeDurableState>;
  current: ReturnType<typeof normalizeAuthority>;
  outcomeIntentDigest: string;
  notesDigest: string;
  requiredSuppressionSubject: SuppressionSubject;
  reasons: string[];
}>) {
  const { candidate, submission, durable, current, outcomeIntentDigest, notesDigest, requiredSuppressionSubject, reasons } = input;
  const pristine = durable.suppressionRecord === null
    && durable.cancellationRecord === null
    && durable.activityRecord === null;
  const complete = durable.suppressionRecord !== null
    && durable.cancellationRecord !== null
    && durable.activityRecord !== null;
  if (!pristine && !complete) reasons.push("partial_manual_call_outcome_state");
  if (durable.suppressionRecord && (durable.suppressionRecord.id !== submission.suppressionTombstoneId
    || durable.suppressionRecord.outcomeIntentDigest !== outcomeIntentDigest
    || !sameSubject(durable.suppressionRecord.subject, requiredSuppressionSubject))) {
    reasons.push("suppression_record_mismatch");
  }
  if (durable.cancellationRecord && (durable.cancellationRecord.id !== submission.cancellationRecordId
    || durable.cancellationRecord.outcomeIntentDigest !== outcomeIntentDigest)) {
    reasons.push("cancellation_record_mismatch");
  }
  if (durable.cancellationRecord
    && !sameStrings(durable.cancellationRecord.workIds, candidate.snapshot.matchingPendingWorkIds)) {
    reasons.push("cancellation_work_set_mismatch");
  }
  validateActivityRecord({
    candidate, submission, activityRecord: durable.activityRecord, current, outcomeIntentDigest, notesDigest, reasons,
  });
  validateRecordTime(durable.suppressionRecord, submission.submittedAt, current.evaluatedAt, "suppression_record_time_invalid", reasons);
  validateRecordTime(durable.cancellationRecord, submission.submittedAt, current.evaluatedAt, "cancellation_record_time_invalid", reasons);
  if (durable.suppressionRecord && durable.cancellationRecord
    && durable.cancellationRecord.recordedAt < durable.suppressionRecord.recordedAt) {
    reasons.push("cancellation_precedes_suppression");
  }
  if (durable.cancellationRecord && durable.activityRecord
    && durable.activityRecord.recordedAt < durable.cancellationRecord.recordedAt) {
    reasons.push("activity_precedes_cancellation");
  }
}

function validateOrdinaryDurability(input: Readonly<{
  candidate: SyntheticManualCallCandidate;
  submission: OutcomeSubmission;
  durable: ReturnType<typeof normalizeDurableState>;
  current: ReturnType<typeof normalizeAuthority>;
  outcomeIntentDigest: string;
  notesDigest: string;
  reasons: string[];
}>) {
  const { candidate, submission, durable, current, outcomeIntentDigest, notesDigest, reasons } = input;
  if (durable.suppressionRecord) reasons.push("unexpected_suppression_record");
  if (durable.cancellationRecord) reasons.push("unexpected_cancellation_record");
  validateActivityRecord({
    candidate, submission, activityRecord: durable.activityRecord, current, outcomeIntentDigest, notesDigest, reasons,
  });
}

function validateActivityRecord(input: Readonly<{
  candidate: SyntheticManualCallCandidate;
  submission: OutcomeSubmission;
  activityRecord: ReturnType<typeof normalizeActivityRecord>;
  current: ReturnType<typeof normalizeAuthority>;
  outcomeIntentDigest: string;
  notesDigest: string;
  reasons: string[];
}>) {
  const { candidate, submission, activityRecord, current, outcomeIntentDigest, notesDigest, reasons } = input;
  if (!activityRecord) return;
  if (activityRecord.id !== submission.activityId
    || activityRecord.outcomeIntentDigest !== outcomeIntentDigest
    || activityRecord.candidateDigest !== candidate.digest
    || activityRecord.outcome !== submission.outcome
    || activityRecord.notesDigest !== notesDigest) reasons.push("activity_record_mismatch");
  validateRecordTime(activityRecord, submission.submittedAt, current.evaluatedAt, "activity_record_time_invalid", reasons);
}

function validateRecordTime(
  record: Readonly<{ recordedAt: number }> | null,
  earliest: number,
  latest: number,
  reason: string,
  reasons: string[],
) {
  if (record && (record.recordedAt < earliest || record.recordedAt > latest)) reasons.push(reason);
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "workspaceId", "companyId", "prospectId", "contactId", "organizationId",
    "profileConfigurationId", "profileConfigurationDigest", "packageArtifact", "callScriptDigest",
    "packageApproval", "selectedPhone", "advisory", "suppressionSubjectIds", "matchingPendingWorkIds",
    "cancellationDependencyIds", "profileAvailable", "prospectApproved", "contactReady", "packageAvailable",
    "phoneAvailable", "paused", "archived", "highRiskDrift", "suppressionBlocked", "stopReasonIds",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt),
    workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId),
    prospectId: syntheticId(input.prospectId),
    contactId: syntheticId(input.contactId),
    organizationId: syntheticId(input.organizationId),
    profileConfigurationId: syntheticId(input.profileConfigurationId),
    profileConfigurationDigest: digest(input.profileConfigurationDigest),
    packageArtifact: normalizeArtifact(input.packageArtifact),
    callScriptDigest: digest(input.callScriptDigest),
    packageApproval: normalizePackageApproval(input.packageApproval),
    selectedPhone: normalizeSelectedPhone(input.selectedPhone),
    advisory: normalizeAdvisory(input.advisory),
    suppressionSubjectIds: sortedUnique(input.suppressionSubjectIds, 1, 32),
    matchingPendingWorkIds: sortedUnique(input.matchingPendingWorkIds, 0, 64),
    cancellationDependencyIds: sortedUnique(input.cancellationDependencyIds, 1, 64),
    profileAvailable: booleanValue(input.profileAvailable),
    prospectApproved: booleanValue(input.prospectApproved),
    contactReady: booleanValue(input.contactReady),
    packageAvailable: booleanValue(input.packageAvailable),
    phoneAvailable: booleanValue(input.phoneAvailable),
    paused: booleanValue(input.paused),
    archived: booleanValue(input.archived),
    highRiskDrift: booleanValue(input.highRiskDrift),
    suppressionBlocked: booleanValue(input.suppressionBlocked),
    stopReasonIds: sortedUnique(input.stopReasonIds, 0, 32),
  });
}

function normalizeSubmission(value: unknown): OutcomeSubmission {
  const input = exactRecord(value, [
    "id", "activityId", "suppressionTombstoneId", "cancellationRecordId", "operatorAttestationId",
    "outcome", "notes", "submittedAt",
  ]);
  if (typeof input.outcome !== "string" || !OUTCOMES.has(input.outcome as ManualOutcome)) invalid();
  const outcome = input.outcome as ManualOutcome;
  const suppressionTombstoneId = nullableSyntheticId(input.suppressionTombstoneId);
  const cancellationRecordId = nullableSyntheticId(input.cancellationRecordId);
  if ((outcome === "do_not_call") !== (suppressionTombstoneId !== null && cancellationRecordId !== null)) invalid();
  const notes = boundedText(input.notes, 512);
  if (!notes.startsWith("Synthetic ") || !syntheticOnlyText(notes)) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    activityId: syntheticId(input.activityId),
    suppressionTombstoneId,
    cancellationRecordId,
    operatorAttestationId: syntheticId(input.operatorAttestationId),
    outcome,
    notes,
    submittedAt: timestamp(input.submittedAt),
  });
}

function normalizeDurableState(value: unknown) {
  const input = exactRecord(value, ["suppressionRecord", "cancellationRecord", "activityRecord"]);
  return deepFreeze({
    suppressionRecord: normalizeSuppressionRecord(input.suppressionRecord),
    cancellationRecord: normalizeCancellationRecord(input.cancellationRecord),
    activityRecord: normalizeActivityRecord(input.activityRecord),
  });
}

function normalizeSuppressionRecord(value: unknown) {
  if (value === null) return null;
  const input = exactRecord(value, ["id", "outcomeIntentDigest", "subject", "recordedAt"]);
  const subjectInput = exactRecord(input.subject, ["kind", "value", "channel"]);
  if (subjectInput.kind !== "exact_phone" || subjectInput.channel !== "phone") invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    outcomeIntentDigest: digest(input.outcomeIntentDigest),
    subject: deepFreeze({
      kind: "exact_phone" as const,
      value: syntheticPhone(subjectInput.value),
      channel: "phone" as const,
    }),
    recordedAt: timestamp(input.recordedAt),
  });
}

function normalizeCancellationRecord(value: unknown) {
  if (value === null) return null;
  const input = exactRecord(value, ["id", "outcomeIntentDigest", "workIds", "recordedAt"]);
  return deepFreeze({
    id: syntheticId(input.id),
    outcomeIntentDigest: digest(input.outcomeIntentDigest),
    workIds: sortedUnique(input.workIds, 0, 64),
    recordedAt: timestamp(input.recordedAt),
  });
}

function normalizeActivityRecord(value: unknown) {
  if (value === null) return null;
  const input = exactRecord(value, [
    "id", "outcomeIntentDigest", "candidateDigest", "outcome", "notesDigest", "recordedAt",
  ]);
  if (typeof input.outcome !== "string" || !OUTCOMES.has(input.outcome as ManualOutcome)) invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    outcomeIntentDigest: digest(input.outcomeIntentDigest),
    candidateDigest: digest(input.candidateDigest),
    outcome: input.outcome as ManualOutcome,
    notesDigest: digest(input.notesDigest),
    recordedAt: timestamp(input.recordedAt),
  });
}

function normalizePackageApproval(value: unknown): PackageApproval {
  const input = exactRecord(value, ["id", "packageId", "packageDigest", "approvedAt", "expiresAt", "active"]);
  return deepFreeze({
    id: syntheticId(input.id),
    packageId: syntheticId(input.packageId),
    packageDigest: digest(input.packageDigest),
    approvedAt: timestamp(input.approvedAt),
    expiresAt: timestamp(input.expiresAt),
    active: booleanValue(input.active),
  });
}

function normalizeSelectedPhone(value: unknown): VerifiedPhone {
  const input = exactRecord(value, [
    "id", "normalizedNumber", "verificationClass", "method", "verificationEvidenceDigest",
    "sourceReferenceDigest", "verifiedAt", "freshUntil",
  ]);
  if (input.verificationClass !== "source_verified" || input.method !== "authoritative_source_reconfirmed") invalid();
  return deepFreeze({
    id: syntheticId(input.id),
    normalizedNumber: syntheticPhone(input.normalizedNumber),
    verificationClass: "source_verified",
    method: "authoritative_source_reconfirmed",
    verificationEvidenceDigest: digest(input.verificationEvidenceDigest),
    sourceReferenceDigest: digest(input.sourceReferenceDigest),
    verifiedAt: timestamp(input.verifiedAt),
    freshUntil: timestamp(input.freshUntil),
  });
}

function normalizeVerification(value: unknown) {
  const input = exactRecord(value, [
    "verificationClass", "method", "verificationEvidenceDigest", "sourceReferenceDigest", "verifiedAt", "freshUntil",
  ]);
  if (input.verificationClass !== "source_verified" || input.method !== "authoritative_source_reconfirmed") invalid();
  return deepFreeze({
    verificationClass: "source_verified" as const,
    method: "authoritative_source_reconfirmed" as const,
    verificationEvidenceDigest: digest(input.verificationEvidenceDigest),
    sourceReferenceDigest: digest(input.sourceReferenceDigest),
    verifiedAt: timestamp(input.verifiedAt),
    freshUntil: timestamp(input.freshUntil),
  });
}

function normalizeAdvisory(value: unknown): Advisory {
  const input = exactRecord(value, [
    "acknowledgementId", "jurisdictionId", "basisEvidenceDigest", "acknowledgedAt", "expiresAt",
  ]);
  return deepFreeze({
    acknowledgementId: syntheticId(input.acknowledgementId),
    jurisdictionId: syntheticId(input.jurisdictionId),
    basisEvidenceDigest: digest(input.basisEvidenceDigest),
    acknowledgedAt: timestamp(input.acknowledgedAt),
    expiresAt: timestamp(input.expiresAt),
  });
}

function normalizeArtifact(value: unknown): Artifact {
  const input = exactRecord(value, ["id", "digest"]);
  return deepFreeze({ id: syntheticId(input.id), digest: digest(input.digest) });
}

function copyCallScript(packageArtifact: SyntheticOutreachPackageArtifact): CallScript {
  return deepFreeze({
    opening: packageArtifact.callScript.opening,
    evidenceHashes: deepFreeze([...packageArtifact.callScript.evidenceHashes]),
    claimGuardrailVersionIds: deepFreeze([...packageArtifact.callScript.claimGuardrailVersionIds]),
    digest: packageArtifact.callScript.digest,
  });
}

function sameArtifact(left: Artifact, right: Artifact) {
  return left.id === right.id && left.digest === right.digest;
}

function sameApproval(left: PackageApproval, right: PackageApproval) {
  return left.id === right.id
    && left.packageId === right.packageId
    && left.packageDigest === right.packageDigest
    && left.approvedAt === right.approvedAt
    && left.expiresAt === right.expiresAt;
}

function samePhone(left: VerifiedPhone, right: VerifiedPhone) {
  return left.id === right.id
    && left.normalizedNumber === right.normalizedNumber
    && left.verificationClass === right.verificationClass
    && left.method === right.method
    && left.verificationEvidenceDigest === right.verificationEvidenceDigest
    && left.sourceReferenceDigest === right.sourceReferenceDigest
    && left.verifiedAt === right.verifiedAt
    && left.freshUntil === right.freshUntil;
}

function sameAdvisory(left: Advisory, right: Advisory) {
  return left.acknowledgementId === right.acknowledgementId
    && left.jurisdictionId === right.jurisdictionId
    && left.basisEvidenceDigest === right.basisEvidenceDigest
    && left.acknowledgedAt === right.acknowledgedAt
    && left.expiresAt === right.expiresAt;
}

function sameSubject(left: SuppressionSubject, right: SuppressionSubject) {
  return left.kind === right.kind && left.value === right.value && left.channel === right.channel;
}

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  const output = dataRecord(value);
  if (Object.keys(output).sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
  return output;
}

function dataRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const output: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function denseArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) invalid();
  const expected = [...Array(value.length).keys()].map(String);
  const actual = keys.filter((key) => key !== "length");
  if (actual.sort().join("\0") !== expected.sort().join("\0")) invalid();
  return expected.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    return descriptor.value;
  });
}

function sortedUnique(value: unknown, minimum: number, maximum: number): readonly string[] {
  const entries = denseArray(value, minimum, maximum).map(syntheticId).sort();
  if (new Set(entries).size !== entries.length) invalid();
  return deepFreeze(entries);
}

function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}

function nullableSyntheticId(value: unknown) {
  return value === null ? null : syntheticId(value);
}

function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

function syntheticPhone(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_PHONE.test(value)) invalid();
  return value;
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value.includes("\0")) invalid();
  return value;
}

function syntheticOnlyText(value: string) {
  return !/(?:https?:\/\/|[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}|\+\d{7,15}|\b(?:bearer|password|secret|oauth|refresh[_ -]?token|access[_ -]?token)\b)/iu.test(value);
}

function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid();
  return value as number;
}

function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function invalid(): never {
  throw new Error("invalid");
}
