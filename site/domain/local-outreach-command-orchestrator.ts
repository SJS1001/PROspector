import {
  createOriginatedMessageReference,
  type ApprovedImmutableMessageReference,
  type MailDispatchEnvelope,
  type MailDispatchResult,
  type MailPort,
  type MailReconciliationResult,
  type OriginatedMessageReference,
} from "./ports/mail";

type DeliveryState =
  | "queued"
  | "leased"
  | "dispatching"
  | "sent"
  | "cancelled"
  | "failed_before_dispatch"
  | "delivery_unknown";

type ExactApproval = Readonly<{
  id: string;
  approvalDigest: string;
  artifactId: string;
  artifactDigest: string;
  expiresAt: number;
  currentId: string;
  currentApprovalDigest: string;
  currentArtifactId: string;
  currentArtifactDigest: string;
  revoked: boolean;
}>;

export type LocalOutreachAuthority = Readonly<{
  packageApproval: ExactApproval;
  messageApproval: ExactApproval;
  messagePackageApprovalId: string;
  messagePackageApprovalDigest: string;
  profileConfigurationId: string;
  profileConfigurationDigest: string;
  currentProfileConfigurationId: string;
  currentProfileConfigurationDigest: string;
  contactEligibilityDigest: string;
  currentContactEligibilityDigest: string;
  contactEligible: boolean;
  contactFreshUntil: number;
  suppressionRevision: number;
  currentSuppressionRevision: number;
  suppressionClear: boolean;
  lifecycleRevision: number;
  currentLifecycleRevision: number;
  lifecycleAvailable: boolean;
  senderConnectionId: string;
  currentSenderConnectionId: string;
  senderConnectionRevision: number;
  currentSenderConnectionRevision: number;
  senderEligible: boolean;
  unsubscribeRevision: number;
  currentUnsubscribeRevision: number;
  unsubscribeWorking: boolean;
  complianceRevision: number;
  currentComplianceRevision: number;
  complianceAcknowledged: boolean;
}>;

export type LocalOutreachRecord = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  companyId: string;
  outboxItemId: string;
  sendKey: string;
  state: DeliveryState;
  revision: number;
  leaseGeneration: number;
  leaseHolderId: string | null;
  leaseExpiresAt: number | null;
  providerAttemptCount: 0 | 1;
  approvedMessage: ApprovedImmutableMessageReference;
  authority: LocalOutreachAuthority;
  originated: OriginatedMessageReference | null;
  deliveryUnknownRecordedAt: number | null;
}>;

type DispatchCommand = Readonly<{
  outboxItemId: string;
  expectedRevision: number;
  leaseGeneration: number;
  leaseHolderId: string;
  operationKey: string;
}>;

type ReconciliationCommand = Readonly<{
  outboxItemId: string;
  expectedRevision: number;
  operationKey: string;
}>;

type CancellationCommand = Readonly<{
  outboxItemId: string;
  expectedRevision: number;
  operationKey: string;
  reason: "owner_cancelled" | "suppressed" | "contact_ineligible" | "authority_invalidated";
}>;

type CompletedResult = Readonly<{
  kind: "sent" | "cancelled" | "failed_before_dispatch" | "delivery_unknown";
  outboxItemId: string;
  revision: number;
  replayed: boolean;
  reason: string;
  providerCalls: 0 | 1;
  automaticRetryAuthorized: false;
  ownerReconciliationRequired: boolean;
}>;

type BlockedResult = Readonly<{
  kind: "blocked";
  reason:
    | "invalid_request"
    | "not_found"
    | "stale_command"
    | "idempotency_conflict"
    | "operation_in_progress"
    | "state_not_actionable"
    | "lease_unavailable"
    | "current_authority_unavailable";
  providerCalls: 0;
  automaticRetryAuthorized: false;
}>;

export type LocalOutreachCommandResult = CompletedResult | BlockedResult;

type OperationReceipt = {
  digest: string;
  status: "in_progress" | "completed";
  result: CompletedResult | null;
};

export type LocalOutreachCommandOrchestrator = Readonly<{
  dispatch(value: unknown): Promise<LocalOutreachCommandResult>;
  reconcile(value: unknown): Promise<LocalOutreachCommandResult>;
  cancel(value: unknown): Promise<LocalOutreachCommandResult>;
  read(outboxItemId: string): LocalOutreachRecord | null;
}>;

type Scope = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  now?: () => number;
}>;

const ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;

/**
 * Local, in-memory orchestration proof for the provider-neutral outreach
 * boundary. Nothing in the application or worker runtime composes this
 * module. The only production mail adapter remains deny-only.
 */
export function createLocalOutreachCommandOrchestrator(
  scopeValue: Scope,
  initialRecordsValue: readonly LocalOutreachRecord[],
  mailPort: MailPort,
): LocalOutreachCommandOrchestrator {
  const scope = normalizeScope(scopeValue);
  if (!Array.isArray(initialRecordsValue) || !isMailPort(mailPort)) invalid("invalid_orchestrator_input");
  const records = new Map<string, LocalOutreachRecord>();
  for (const value of initialRecordsValue) {
    const record = normalizeRecord(value);
    if (record.workspaceId !== scope.workspaceId || record.ownerSubject !== scope.ownerSubject) {
      invalid("invalid_orchestrator_scope");
    }
    if (records.has(record.outboxItemId)) invalid("duplicate_outbox_item");
    records.set(record.outboxItemId, record);
  }
  const receipts = new Map<string, OperationReceipt>();
  const mailPortUnavailable = rejectOnlyPort(mailPort);

  async function dispatch(value: unknown): Promise<LocalOutreachCommandResult> {
    const command = normalizeDispatchCommand(value);
    if (!command) return blocked("invalid_request");
    const operationDigest = await sha256(canonical([
      "local-outreach-dispatch/v1",
      scope.workspaceId,
      scope.ownerSubject,
      command.outboxItemId,
      command.expectedRevision,
      command.leaseGeneration,
      command.leaseHolderId,
    ]));
    const replay = replayResult(receipts, command.operationKey, operationDigest);
    if (replay) return replay;
    const initial = records.get(command.outboxItemId);
    if (!initial) return blocked("not_found");
    if (initial.revision !== command.expectedRevision) return blocked("stale_command");
    if (initial.state !== "leased" || initial.providerAttemptCount !== 0) return blocked("state_not_actionable");
    const now = scope.now();
    if (!validNow(now)) return blocked("current_authority_unavailable");
    if (
      initial.leaseGeneration !== command.leaseGeneration
      || initial.leaseHolderId !== command.leaseHolderId
      || initial.leaseExpiresAt === null
      || initial.leaseExpiresAt <= now
    ) return blocked("lease_unavailable");
    const authorityReason = currentAuthorityFailure(initial, now);
    if (authorityReason) {
      const result = complete(initial, initial.state === "leased" ? "cancelled" : "failed_before_dispatch", authorityReason, 0, now);
      records.set(initial.outboxItemId, result.record);
      const completed = resultValue(result.record, authorityReason, 0, false);
      receipts.set(command.operationKey, { digest: operationDigest, status: "completed", result: completed });
      return completed;
    }
    if (mailPortUnavailable) {
      const result = complete(initial, "failed_before_dispatch", "mail_port_unconfigured", 0, now);
      records.set(initial.outboxItemId, result.record);
      const completed = resultValue(result.record, "mail_port_unconfigured", 0, false);
      receipts.set(command.operationKey, { digest: operationDigest, status: "completed", result: completed });
      return completed;
    }

    const originated = await createOriginatedMessageReference({
      approvedMessage: initial.approvedMessage,
      idempotency: {
        outboxItemId: initial.outboxItemId,
        sendKey: initial.sendKey,
        leaseGeneration: initial.leaseGeneration,
        providerAttempt: 1,
      },
      originatedMessageId: `originated-${initial.outboxItemId}`,
      originatedThreadId: `thread-${initial.outboxItemId}`,
    });

    // Re-read after asynchronous marker construction. A cancellation or
    // authority replacement that won this interval prevents a port call.
    const current = records.get(command.outboxItemId);
    if (!current || current.revision !== initial.revision || current.state !== "leased") {
      return blocked("stale_command");
    }
    const finalNow = scope.now();
    if (!validNow(finalNow) || currentAuthorityFailure(current, finalNow)) {
      const result = complete(current, "cancelled", "final_recheck_failed", 0, finalNow);
      records.set(current.outboxItemId, result.record);
      const completed = resultValue(result.record, "final_recheck_failed", 0, false);
      receipts.set(command.operationKey, { digest: operationDigest, status: "completed", result: completed });
      return completed;
    }

    const dispatching = freezeRecord({
      ...current,
      state: "dispatching",
      revision: current.revision + 1,
      providerAttemptCount: 1,
      originated,
    });
    records.set(current.outboxItemId, dispatching);
    receipts.set(command.operationKey, { digest: operationDigest, status: "in_progress", result: null });
    const envelope: MailDispatchEnvelope = Object.freeze({
      approvedMessage: dispatching.approvedMessage,
      idempotency: Object.freeze({
        outboxItemId: dispatching.outboxItemId,
        sendKey: dispatching.sendKey,
        leaseGeneration: dispatching.leaseGeneration,
        providerAttempt: 1,
      }),
      originated,
    });

    let providerResult: MailDispatchResult;
    try {
      providerResult = await mailPort.dispatch(envelope);
    } catch {
      return finishDispatch(command.operationKey, operationDigest, dispatching, "delivery_unknown", "provider_result_unavailable", 1, scope.now());
    }
    const classified = classifyDispatchResult(providerResult, originated);
    return finishDispatch(
      command.operationKey,
      operationDigest,
      dispatching,
      classified.state,
      classified.reason,
      1,
      scope.now(),
    );
  }

  async function reconcile(value: unknown): Promise<LocalOutreachCommandResult> {
    const command = normalizeReconciliationCommand(value);
    if (!command) return blocked("invalid_request");
    const operationDigest = await sha256(canonical([
      "local-outreach-reconciliation/v1",
      scope.workspaceId,
      scope.ownerSubject,
      command.outboxItemId,
      command.expectedRevision,
    ]));
    const replay = replayResult(receipts, command.operationKey, operationDigest);
    if (replay) return replay;
    const current = records.get(command.outboxItemId);
    if (!current) return blocked("not_found");
    if (current.revision !== command.expectedRevision) return blocked("stale_command");
    if (
      current.state !== "delivery_unknown"
      || current.providerAttemptCount !== 1
      || current.originated === null
      || current.deliveryUnknownRecordedAt === null
    ) return blocked("state_not_actionable");
    if (mailPortUnavailable) {
      const next = freezeRecord({ ...current, revision: current.revision + 1 });
      records.set(current.outboxItemId, next);
      const completed = resultValue(next, "reconciliation_connection_unavailable", 0, true);
      receipts.set(command.operationKey, { digest: operationDigest, status: "completed", result: completed });
      return completed;
    }
    receipts.set(command.operationKey, { digest: operationDigest, status: "in_progress", result: null });
    let providerResult: MailReconciliationResult;
    try {
      providerResult = await mailPort.reconcile(Object.freeze({
        approvedMessage: current.approvedMessage,
        idempotency: Object.freeze({
          outboxItemId: current.outboxItemId,
          sendKey: current.sendKey,
          leaseGeneration: current.leaseGeneration,
          providerAttempt: 1,
        }),
        deliveryUnknownRecordedAt: current.deliveryUnknownRecordedAt,
        originated: current.originated,
      }));
    } catch {
      return finishReconciliation(command.operationKey, operationDigest, current, "delivery_unknown", "reconciliation_unavailable");
    }
    const classified = classifyReconciliationResult(providerResult, current.originated);
    return finishReconciliation(command.operationKey, operationDigest, current, classified.state, classified.reason);
  }

  async function cancel(value: unknown): Promise<LocalOutreachCommandResult> {
    const command = normalizeCancellationCommand(value);
    if (!command) return blocked("invalid_request");
    const operationDigest = await sha256(canonical([
      "local-outreach-cancellation/v1",
      scope.workspaceId,
      scope.ownerSubject,
      command.outboxItemId,
      command.expectedRevision,
      command.reason,
    ]));
    const replay = replayResult(receipts, command.operationKey, operationDigest);
    if (replay) return replay;
    const current = records.get(command.outboxItemId);
    if (!current) return blocked("not_found");
    if (current.revision !== command.expectedRevision) return blocked("stale_command");
    if (!(["queued", "leased", "failed_before_dispatch"] as DeliveryState[]).includes(current.state)) {
      return blocked("state_not_actionable");
    }
    const result = complete(current, "cancelled", command.reason, 0, scope.now());
    records.set(current.outboxItemId, result.record);
    const completed = resultValue(result.record, command.reason, 0, false);
    receipts.set(command.operationKey, { digest: operationDigest, status: "completed", result: completed });
    return completed;
  }

  function finishDispatch(
    operationKey: string,
    operationDigest: string,
    started: LocalOutreachRecord,
    state: "sent" | "failed_before_dispatch" | "delivery_unknown",
    reason: string,
    providerCalls: 1,
    now: number,
  ): CompletedResult {
    const latest = records.get(started.outboxItemId);
    if (!latest || latest.revision !== started.revision || latest.state !== "dispatching") {
      const unknown = latest?.state === "delivery_unknown"
        ? latest
        : freezeRecord({
            ...started,
            state: "delivery_unknown",
            revision: started.revision + 1,
            deliveryUnknownRecordedAt: validNow(now) ? now : started.leaseExpiresAt,
          });
      records.set(started.outboxItemId, unknown);
      const completed = resultValue(unknown, "terminal_persistence_conflict", providerCalls, true);
      receipts.set(operationKey, { digest: operationDigest, status: "completed", result: completed });
      return completed;
    }
    const result = complete(latest, state, reason, providerCalls, now);
    records.set(latest.outboxItemId, result.record);
    const completed = resultValue(result.record, reason, providerCalls, state === "delivery_unknown");
    receipts.set(operationKey, { digest: operationDigest, status: "completed", result: completed });
    return completed;
  }

  function finishReconciliation(
    operationKey: string,
    operationDigest: string,
    current: LocalOutreachRecord,
    state: "sent" | "delivery_unknown",
    reason: string,
  ): CompletedResult {
    const latest = records.get(current.outboxItemId);
    if (!latest || latest.revision !== current.revision || latest.state !== "delivery_unknown") {
      const completed = resultValue(current, "reconciliation_state_conflict", 1, true);
      receipts.set(operationKey, { digest: operationDigest, status: "completed", result: completed });
      return completed;
    }
    const next = state === "sent"
      ? complete(latest, "sent", reason, 1, scope.now()).record
      : freezeRecord({ ...latest, revision: latest.revision + 1 });
    records.set(latest.outboxItemId, next);
    const completed = resultValue(next, reason, 1, state === "delivery_unknown");
    receipts.set(operationKey, { digest: operationDigest, status: "completed", result: completed });
    return completed;
  }

  return Object.freeze({
    dispatch,
    reconcile,
    cancel,
    read(outboxItemId: string) {
      if (!id(outboxItemId)) return null;
      return records.get(outboxItemId) ?? null;
    },
  });
}

function currentAuthorityFailure(record: LocalOutreachRecord, now: number): string | null {
  const { packageApproval, messageApproval } = record.authority;
  if (!approvalCurrent(packageApproval, now)) return "package_approval_not_current";
  if (!approvalCurrent(messageApproval, now)) return "message_approval_not_current";
  if (
    record.authority.messagePackageApprovalId !== packageApproval.id
    || record.authority.messagePackageApprovalDigest !== packageApproval.approvalDigest
  ) return "message_package_approval_binding_changed";
  if (packageApproval.artifactId !== record.approvedMessage.packageVersionId || packageApproval.artifactDigest !== record.approvedMessage.packageDigest) {
    return "package_artifact_changed";
  }
  if (messageApproval.id !== record.approvedMessage.messageApprovalId || messageApproval.approvalDigest !== record.approvedMessage.messageApprovalDigest) {
    return "message_approval_binding_changed";
  }
  if (messageApproval.artifactId !== record.approvedMessage.messageVersionId || messageApproval.artifactDigest !== record.approvedMessage.messageDigest) {
    return "message_artifact_changed";
  }
  const authority = record.authority;
  if (
    authority.profileConfigurationId !== record.approvedMessage.profileConfigurationId
    || authority.profileConfigurationDigest !== record.approvedMessage.profileConfigurationDigest
    || authority.profileConfigurationId !== authority.currentProfileConfigurationId
    || authority.profileConfigurationDigest !== authority.currentProfileConfigurationDigest
  ) return "profile_configuration_changed";
  if (!authority.contactEligible || authority.contactEligibilityDigest !== authority.currentContactEligibilityDigest || authority.contactFreshUntil <= now) return "contact_ineligible";
  if (!authority.suppressionClear || authority.suppressionRevision !== authority.currentSuppressionRevision) return "suppressed";
  if (!authority.lifecycleAvailable || authority.lifecycleRevision !== authority.currentLifecycleRevision) return "lifecycle_unavailable";
  if (
    !authority.senderEligible
    || authority.senderConnectionId !== authority.currentSenderConnectionId
    || authority.senderConnectionRevision !== authority.currentSenderConnectionRevision
  ) return "sender_unavailable";
  if (!authority.unsubscribeWorking || authority.unsubscribeRevision !== authority.currentUnsubscribeRevision) return "unsubscribe_unavailable";
  if (!authority.complianceAcknowledged || authority.complianceRevision !== authority.currentComplianceRevision) return "compliance_unavailable";
  return null;
}

function approvalCurrent(value: ExactApproval, now: number): boolean {
  return !value.revoked
    && value.expiresAt > now
    && value.id === value.currentId
    && value.approvalDigest === value.currentApprovalDigest
    && value.artifactId === value.currentArtifactId
    && value.artifactDigest === value.currentArtifactDigest;
}

function classifyDispatchResult(
  value: unknown,
  expectedOriginated: OriginatedMessageReference,
): Readonly<{ state: "sent" | "failed_before_dispatch" | "delivery_unknown"; reason: string }> {
  const input = exactRecord(value);
  if (!input || typeof input.status !== "string" || input.automaticRetryAuthorized !== false) {
    return { state: "delivery_unknown", reason: "provider_result_invalid" };
  }
  if (input.status === "accepted" && exactKeys(input, ["status", "originated", "acceptedAt", "automaticRetryAuthorized"])) {
    return originatedMatches(input.originated, expectedOriginated) && validNow(input.acceptedAt)
      ? { state: "sent", reason: "provider_accepted" }
      : { state: "delivery_unknown", reason: "provider_acceptance_invalid" };
  }
  if (input.status === "definite_failure" && exactKeys(input, ["status", "reason", "requestTransmitted", "automaticRetryAuthorized"])) {
    return input.requestTransmitted === false && ["connection_unavailable", "sender_unavailable", "request_rejected_before_transmission"].includes(String(input.reason))
      ? { state: "failed_before_dispatch", reason: String(input.reason) }
      : { state: "delivery_unknown", reason: "provider_failure_invalid" };
  }
  if (input.status === "delivery_unknown" && exactKeys(input, ["status", "ambiguity", "originated", "ownerReconciliationRequired", "automaticRetryAuthorized"])) {
    return input.ownerReconciliationRequired === true
      && ["accepted_response_lost", "request_transmission_unknown", "post_acceptance_persistence_failed"].includes(String(input.ambiguity))
      && originatedMatches(input.originated, expectedOriginated)
      ? { state: "delivery_unknown", reason: String(input.ambiguity) }
      : { state: "delivery_unknown", reason: "provider_ambiguity_invalid" };
  }
  return { state: "delivery_unknown", reason: "provider_result_invalid" };
}

function classifyReconciliationResult(
  value: unknown,
  expectedOriginated: OriginatedMessageReference,
): Readonly<{ state: "sent" | "delivery_unknown"; reason: string }> {
  const input = exactRecord(value);
  if (!input || typeof input.status !== "string" || input.automaticRetryAuthorized !== false) {
    return { state: "delivery_unknown", reason: "reconciliation_result_invalid" };
  }
  if (input.status === "sent_confirmed" && exactKeys(input, ["status", "evidence", "originated", "observedAt", "automaticRetryAuthorized"])) {
    return input.evidence === "exact_originated_match"
      && originatedMatches(input.originated, expectedOriginated)
      && validNow(input.observedAt)
      ? { state: "sent", reason: "exact_originated_match" }
      : { state: "delivery_unknown", reason: "reconciliation_match_invalid" };
  }
  if (input.status === "delivery_unknown" && exactKeys(input, ["status", "evidence", "ownerReconciliationRequired", "automaticRetryAuthorized"])) {
    return input.ownerReconciliationRequired === true
      && ["not_found", "conflicting_evidence", "connection_unavailable"].includes(String(input.evidence))
      ? { state: "delivery_unknown", reason: String(input.evidence) }
      : { state: "delivery_unknown", reason: "reconciliation_unknown_invalid" };
  }
  return { state: "delivery_unknown", reason: "reconciliation_result_invalid" };
}

function complete(
  record: LocalOutreachRecord,
  state: "sent" | "cancelled" | "failed_before_dispatch" | "delivery_unknown",
  _reason: string,
  _providerCalls: 0 | 1,
  now: number,
): Readonly<{ record: LocalOutreachRecord }> {
  const recordedAt = validNow(now) ? now : record.leaseExpiresAt;
  return Object.freeze({
    record: freezeRecord({
      ...record,
      state,
      revision: record.revision + 1,
      deliveryUnknownRecordedAt: state === "delivery_unknown" ? recordedAt : record.deliveryUnknownRecordedAt,
    }),
  });
}

function resultValue(
  record: LocalOutreachRecord,
  reason: string,
  providerCalls: 0 | 1,
  ownerReconciliationRequired: boolean,
  replayed = false,
): CompletedResult {
  if (!["sent", "cancelled", "failed_before_dispatch", "delivery_unknown"].includes(record.state)) invalid("invalid_terminal_result");
  return Object.freeze({
    kind: record.state as CompletedResult["kind"],
    outboxItemId: record.outboxItemId,
    revision: record.revision,
    replayed,
    reason,
    providerCalls,
    automaticRetryAuthorized: false,
    ownerReconciliationRequired,
  });
}

function replayResult(receipts: Map<string, OperationReceipt>, operationKey: string, digestValue: string): LocalOutreachCommandResult | null {
  const receipt = receipts.get(operationKey);
  if (!receipt) return null;
  if (receipt.digest !== digestValue) return blocked("idempotency_conflict");
  if (receipt.status === "in_progress" || !receipt.result) return blocked("operation_in_progress");
  return Object.freeze({ ...receipt.result, replayed: true });
}

function normalizeRecord(value: unknown): LocalOutreachRecord {
  const input = exactRecord(value);
  if (!input || !exactKeys(input, [
    "workspaceId", "ownerSubject", "companyId", "outboxItemId", "sendKey", "state", "revision",
    "leaseGeneration", "leaseHolderId", "leaseExpiresAt", "providerAttemptCount", "approvedMessage",
    "authority", "originated", "deliveryUnknownRecordedAt",
  ])) invalid("invalid_outreach_record");
  const approvedMessage = normalizeApprovedMessage(input.approvedMessage);
  const authority = normalizeAuthority(input.authority);
  if (!["queued", "leased", "dispatching", "sent", "cancelled", "failed_before_dispatch", "delivery_unknown"].includes(String(input.state))) invalid("invalid_outreach_record");
  if (![0, 1].includes(Number(input.providerAttemptCount))) invalid("invalid_outreach_record");
  if (![input.revision, input.leaseGeneration].every((item) => Number.isSafeInteger(item) && Number(item) >= 0)) invalid("invalid_outreach_record");
  if (input.state === "leased" && (!id(input.leaseHolderId) || !validNow(input.leaseExpiresAt) || Number(input.leaseGeneration) < 1)) invalid("invalid_outreach_record");
  const originated = input.originated === null ? null : normalizeOriginated(input.originated);
  if (Number(input.providerAttemptCount) === 1 && originated === null) invalid("invalid_outreach_record");
  if (input.state === "delivery_unknown" && !validNow(input.deliveryUnknownRecordedAt)) invalid("invalid_outreach_record");
  const record = {
    workspaceId: requiredId(input.workspaceId),
    ownerSubject: requiredId(input.ownerSubject),
    companyId: requiredId(input.companyId),
    outboxItemId: requiredId(input.outboxItemId),
    sendKey: requiredId(input.sendKey),
    state: input.state as DeliveryState,
    revision: Number(input.revision),
    leaseGeneration: Number(input.leaseGeneration),
    leaseHolderId: input.leaseHolderId === null ? null : requiredId(input.leaseHolderId),
    leaseExpiresAt: input.leaseExpiresAt === null ? null : Number(input.leaseExpiresAt),
    providerAttemptCount: Number(input.providerAttemptCount) as 0 | 1,
    approvedMessage,
    authority,
    originated,
    deliveryUnknownRecordedAt: input.deliveryUnknownRecordedAt === null ? null : Number(input.deliveryUnknownRecordedAt),
  };
  if (record.workspaceId !== approvedMessage.workspaceId || record.companyId !== approvedMessage.companyId) invalid("invalid_outreach_record");
  if (
    (["queued", "leased", "cancelled"] as DeliveryState[]).includes(record.state)
    && (record.providerAttemptCount !== 0 || record.originated !== null)
  ) invalid("invalid_outreach_record");
  if (
    (["dispatching", "sent", "delivery_unknown"] as DeliveryState[]).includes(record.state)
    && (record.providerAttemptCount !== 1 || record.originated === null)
  ) invalid("invalid_outreach_record");
  return freezeRecord(record);
}

function normalizeAuthority(value: unknown): LocalOutreachAuthority {
  const input = exactRecord(value);
  if (!input || !exactKeys(input, [
    "packageApproval", "messageApproval", "messagePackageApprovalId", "messagePackageApprovalDigest",
    "profileConfigurationId", "profileConfigurationDigest", "currentProfileConfigurationId",
    "currentProfileConfigurationDigest", "contactEligibilityDigest", "currentContactEligibilityDigest",
    "contactEligible", "contactFreshUntil", "suppressionRevision", "currentSuppressionRevision", "suppressionClear",
    "lifecycleRevision", "currentLifecycleRevision", "lifecycleAvailable", "senderConnectionId",
    "currentSenderConnectionId", "senderConnectionRevision", "currentSenderConnectionRevision", "senderEligible",
    "unsubscribeRevision", "currentUnsubscribeRevision", "unsubscribeWorking", "complianceRevision",
    "currentComplianceRevision", "complianceAcknowledged",
  ])) invalid("invalid_outreach_authority");
  for (const key of ["contactEligible", "suppressionClear", "lifecycleAvailable", "senderEligible", "unsubscribeWorking", "complianceAcknowledged"] as const) {
    if (typeof input[key] !== "boolean") invalid("invalid_outreach_authority");
  }
  for (const key of [
    "contactFreshUntil", "suppressionRevision", "currentSuppressionRevision", "lifecycleRevision",
    "currentLifecycleRevision", "senderConnectionRevision", "currentSenderConnectionRevision",
    "unsubscribeRevision", "currentUnsubscribeRevision", "complianceRevision", "currentComplianceRevision",
  ] as const) {
    if (!Number.isSafeInteger(input[key]) || Number(input[key]) < 1) invalid("invalid_outreach_authority");
  }
  return Object.freeze({
    packageApproval: normalizeApproval(input.packageApproval),
    messageApproval: normalizeApproval(input.messageApproval),
    messagePackageApprovalId: requiredId(input.messagePackageApprovalId),
    messagePackageApprovalDigest: requiredDigest(input.messagePackageApprovalDigest),
    profileConfigurationId: requiredId(input.profileConfigurationId),
    profileConfigurationDigest: requiredDigest(input.profileConfigurationDigest),
    currentProfileConfigurationId: requiredId(input.currentProfileConfigurationId),
    currentProfileConfigurationDigest: requiredDigest(input.currentProfileConfigurationDigest),
    contactEligibilityDigest: requiredDigest(input.contactEligibilityDigest),
    currentContactEligibilityDigest: requiredDigest(input.currentContactEligibilityDigest),
    contactEligible: input.contactEligible as boolean,
    contactFreshUntil: Number(input.contactFreshUntil),
    suppressionRevision: Number(input.suppressionRevision),
    currentSuppressionRevision: Number(input.currentSuppressionRevision),
    suppressionClear: input.suppressionClear as boolean,
    lifecycleRevision: Number(input.lifecycleRevision),
    currentLifecycleRevision: Number(input.currentLifecycleRevision),
    lifecycleAvailable: input.lifecycleAvailable as boolean,
    senderConnectionId: requiredId(input.senderConnectionId),
    currentSenderConnectionId: requiredId(input.currentSenderConnectionId),
    senderConnectionRevision: Number(input.senderConnectionRevision),
    currentSenderConnectionRevision: Number(input.currentSenderConnectionRevision),
    senderEligible: input.senderEligible as boolean,
    unsubscribeRevision: Number(input.unsubscribeRevision),
    currentUnsubscribeRevision: Number(input.currentUnsubscribeRevision),
    unsubscribeWorking: input.unsubscribeWorking as boolean,
    complianceRevision: Number(input.complianceRevision),
    currentComplianceRevision: Number(input.currentComplianceRevision),
    complianceAcknowledged: input.complianceAcknowledged as boolean,
  });
}

function normalizeApproval(value: unknown): ExactApproval {
  const input = exactRecord(value);
  if (!input || !exactKeys(input, [
    "id", "approvalDigest", "artifactId", "artifactDigest", "expiresAt", "currentId",
    "currentApprovalDigest", "currentArtifactId", "currentArtifactDigest", "revoked",
  ]) || typeof input.revoked !== "boolean" || !validNow(input.expiresAt)) invalid("invalid_outreach_approval");
  return Object.freeze({
    id: requiredId(input.id),
    approvalDigest: requiredDigest(input.approvalDigest),
    artifactId: requiredId(input.artifactId),
    artifactDigest: requiredDigest(input.artifactDigest),
    expiresAt: Number(input.expiresAt),
    currentId: requiredId(input.currentId),
    currentApprovalDigest: requiredDigest(input.currentApprovalDigest),
    currentArtifactId: requiredId(input.currentArtifactId),
    currentArtifactDigest: requiredDigest(input.currentArtifactDigest),
    revoked: input.revoked,
  });
}

function normalizeApprovedMessage(value: unknown): ApprovedImmutableMessageReference {
  const input = exactRecord(value);
  if (!input || !exactKeys(input, [
    "workspaceId", "companyId", "messageVersionId", "messageDigest", "messageApprovalId",
    "messageApprovalDigest", "packageVersionId", "packageDigest", "profileConfigurationId",
    "profileConfigurationDigest",
  ])) invalid("invalid_approved_message");
  return Object.freeze({
    workspaceId: requiredId(input.workspaceId),
    companyId: requiredId(input.companyId),
    messageVersionId: requiredId(input.messageVersionId),
    messageDigest: requiredDigest(input.messageDigest),
    messageApprovalId: requiredId(input.messageApprovalId),
    messageApprovalDigest: requiredDigest(input.messageApprovalDigest),
    packageVersionId: requiredId(input.packageVersionId),
    packageDigest: requiredDigest(input.packageDigest),
    profileConfigurationId: requiredId(input.profileConfigurationId),
    profileConfigurationDigest: requiredDigest(input.profileConfigurationDigest),
  });
}

function normalizeOriginated(value: unknown): OriginatedMessageReference {
  const input = exactRecord(value);
  if (!input || !exactKeys(input, ["originatedMessageId", "originatedThreadId", "rfcMessageId", "marker"])) invalid("invalid_originated_reference");
  const originatedMessageId = requiredId(input.originatedMessageId);
  const originatedThreadId = requiredId(input.originatedThreadId);
  if (typeof input.rfcMessageId !== "string" || !/^<[a-f0-9]{64}@prospector\.invalid>$/u.test(input.rfcMessageId)) invalid("invalid_originated_reference");
  if (typeof input.marker !== "string" || !/^prospector-origin\/v1:[a-f0-9]{64}$/u.test(input.marker)) invalid("invalid_originated_reference");
  return Object.freeze({ originatedMessageId, originatedThreadId, rfcMessageId: input.rfcMessageId, marker: input.marker });
}

function originatedMatches(value: unknown, expected: OriginatedMessageReference): boolean {
  try {
    const actual = normalizeOriginated(value);
    return actual.originatedMessageId === expected.originatedMessageId
      && actual.originatedThreadId === expected.originatedThreadId
      && actual.rfcMessageId === expected.rfcMessageId
      && actual.marker === expected.marker;
  } catch {
    return false;
  }
}

function normalizeScope(value: unknown): Required<Scope> {
  const input = exactRecord(value);
  if (!input || !dataKeys(input, ["workspaceId", "ownerSubject"], ["now"])) invalid("invalid_orchestrator_scope");
  if (input.now !== undefined && typeof input.now !== "function") invalid("invalid_orchestrator_scope");
  return Object.freeze({
    workspaceId: requiredId(input.workspaceId),
    ownerSubject: requiredId(input.ownerSubject),
    now: (input.now as (() => number) | undefined) ?? Date.now,
  });
}

function normalizeDispatchCommand(value: unknown): DispatchCommand | null {
  const input = exactRecord(value);
  if (!input || !exactKeys(input, ["outboxItemId", "expectedRevision", "leaseGeneration", "leaseHolderId", "operationKey"])) return null;
  if (![input.expectedRevision, input.leaseGeneration].every((item) => Number.isSafeInteger(item) && Number(item) > 0)) return null;
  if (![input.outboxItemId, input.leaseHolderId, input.operationKey].every(id)) return null;
  return Object.freeze({ outboxItemId: String(input.outboxItemId), expectedRevision: Number(input.expectedRevision), leaseGeneration: Number(input.leaseGeneration), leaseHolderId: String(input.leaseHolderId), operationKey: String(input.operationKey) });
}

function normalizeReconciliationCommand(value: unknown): ReconciliationCommand | null {
  const input = exactRecord(value);
  if (!input || !exactKeys(input, ["outboxItemId", "expectedRevision", "operationKey"])) return null;
  if (!id(input.outboxItemId) || !id(input.operationKey) || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) return null;
  return Object.freeze({ outboxItemId: String(input.outboxItemId), expectedRevision: Number(input.expectedRevision), operationKey: String(input.operationKey) });
}

function normalizeCancellationCommand(value: unknown): CancellationCommand | null {
  const input = exactRecord(value);
  if (!input || !exactKeys(input, ["outboxItemId", "expectedRevision", "operationKey", "reason"])) return null;
  if (!id(input.outboxItemId) || !id(input.operationKey) || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) return null;
  if (!["owner_cancelled", "suppressed", "contact_ineligible", "authority_invalidated"].includes(String(input.reason))) return null;
  return Object.freeze({ outboxItemId: String(input.outboxItemId), expectedRevision: Number(input.expectedRevision), operationKey: String(input.operationKey), reason: input.reason as CancellationCommand["reason"] });
}

function freezeRecord(value: LocalOutreachRecord): LocalOutreachRecord {
  return Object.freeze({ ...value, approvedMessage: Object.freeze({ ...value.approvedMessage }), authority: Object.freeze({ ...value.authority }) });
}

function blocked(reason: BlockedResult["reason"]): BlockedResult {
  return Object.freeze({ kind: "blocked", reason, providerCalls: 0, automaticRetryAuthorized: false });
}

function isMailPort(value: unknown): value is MailPort {
  const input = exactRecord(value);
  return !!input && dataKeys(
    input,
    ["dispatch", "reconcile", "syncOriginatedEvents"],
    ["state", "providerInvocationCount"],
  )
    && [input.dispatch, input.reconcile, input.syncOriginatedEvents].every((item) => typeof item === "function");
}

function rejectOnlyPort(value: MailPort): boolean {
  const input = exactRecord(value);
  return input?.state === "UNCONFIGURED" && input.providerInvocationCount === 0;
}

function exactRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) return null;
    const record: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (!("value" in descriptor) || !descriptor.enumerable) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function dataKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}

function id(value: unknown): boolean {
  return typeof value === "string" && ID.test(value);
}

function requiredId(value: unknown): string {
  if (!id(value)) invalid("invalid_identifier");
  return String(value);
}

function requiredDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid("invalid_digest");
  return value;
}

function validNow(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invalid(message: string): never {
  throw new TypeError(message);
}
