type Effects = Readonly<{
  providerCalls: 0;
  outboxMutations: 0;
  sendInvocations: 0;
  callInvocations: 0;
  exportMutations: 0;
  durableMutations: 0;
}>;

const ACTIONS = {
  package_approval_decision: ["outreach_package", "synthetic_owner", false],
  message_approval_decision: ["outreach_message", "synthetic_owner", false],
  dispatch_recheck_decision: ["dispatch_intent", "synthetic_system", true],
  originated_stop_decision: ["originated_event", "synthetic_system", false],
  delivery_unknown_decision: ["delivery_attempt", "synthetic_system", true],
  suppression_before_success_decision: ["suppression_intent", "synthetic_public", false],
  manual_call_eligibility_decision: ["manual_call_candidate", "synthetic_owner", false],
  manual_call_outcome_decision: ["manual_call_outcome", "synthetic_owner", false],
} as const;

type Action = keyof typeof ACTIONS;
type Actor = Readonly<{ kind: string; id: string }>;
type Subject = Readonly<{ kind: string; id: string; digest: string }>;
type Policy = Readonly<{ id: string; digest: string; reasonCodeRegistryDigest: string }>;
type Fence = Readonly<{ leaseGeneration: number; dispatchKeyDigest: string }> | null;
type Snapshot = Readonly<{
  id: string;
  recordId: string;
  workspaceId: string;
  companyId: string;
  actor: Actor;
  action: Action;
  subject: Subject;
  resultCode: string;
  reasonCodes: readonly string[];
  beforeStateDigest: string | null;
  afterStateDigest: string | null;
  decisionDigest: string;
  operationDigest: string;
  policy: Policy;
  dependencyDigests: readonly string[];
  fence: Fence;
  occurredAt: number;
}>;

export type SyntheticOutreachAuditEnvelope = Readonly<{
  kind: "synthetic_outreach_audit_envelope";
  id: string;
  digest: string;
  snapshot: Snapshot;
  auditPersistenceAuthorized: false;
  loggerInvocationAuthorized: false;
  externalSinkAuthorized: false;
  providerInvocationAuthorized: false;
  effects: Effects;
}>;

const SYNTHETIC_ID = /^synthetic-[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,127}$/u;
const SENSITIVE_CODE = /(?:^|_)(?:password|secret|credential|bearer|oauth|access_token|refresh_token)(?:$|_)/u;
const envelopeArtifacts = new WeakSet<object>();
const ZERO_EFFECTS: Effects = deepFreeze({
  providerCalls: 0,
  outboxMutations: 0,
  sendInvocations: 0,
  callInvocations: 0,
  exportMutations: 0,
  durableMutations: 0,
});

/** Canonicalizes a minimized synthetic audit envelope; it cannot log or persist. */
export async function buildSyntheticOutreachAuditEnvelope(value: unknown): Promise<SyntheticOutreachAuditEnvelope> {
  try {
    const snapshot = normalizeSnapshot(value);
    const artifact: SyntheticOutreachAuditEnvelope = deepFreeze({
      kind: "synthetic_outreach_audit_envelope",
      id: snapshot.id,
      digest: await sha256(JSON.stringify(snapshot)),
      snapshot,
      auditPersistenceAuthorized: false,
      loggerInvocationAuthorized: false,
      externalSinkAuthorized: false,
      providerInvocationAuthorized: false,
      effects: ZERO_EFFECTS,
    });
    envelopeArtifacts.add(artifact);
    return artifact;
  } catch {
    throw new Error("synthetic_outreach_audit_envelope_invalid");
  }
}

/** Rechecks a synthetic audit tuple and projects, but never performs, an append. */
export async function evaluateSyntheticOutreachAuditAppend(value: unknown) {
  try {
    const input = exactRecord(value, ["envelopeArtifact", "currentEnvelope", "currentAuthority"]);
    if (!envelopeArtifacts.has(input.envelopeArtifact as object)) invalid();
    const artifact = input.envelopeArtifact as SyntheticOutreachAuditEnvelope;
    const currentEnvelope = await buildSyntheticOutreachAuditEnvelope(input.currentEnvelope);
    const current = normalizeAuthority(input.currentAuthority);
    const snapshot = artifact.snapshot;
    const reasons: string[] = [];

    if (currentEnvelope.digest !== artifact.digest) reasons.push("audit_envelope_changed");
    if (current.workspaceId !== snapshot.workspaceId) reasons.push("workspace_scope_mismatch");
    if (current.companyId !== snapshot.companyId) reasons.push("company_scope_mismatch");
    if (!sameActor(current.actor, snapshot.actor)) reasons.push("actor_binding_changed");
    if (current.action !== snapshot.action) reasons.push("action_changed");
    if (!sameSubject(current.subject, snapshot.subject)) reasons.push("subject_binding_changed");
    if (current.resultCode !== snapshot.resultCode) reasons.push("result_code_changed");
    if (!sameStrings(current.reasonCodes, snapshot.reasonCodes)) reasons.push("reason_code_set_changed");
    if (current.beforeStateDigest !== snapshot.beforeStateDigest) reasons.push("before_state_changed");
    if (current.afterStateDigest !== snapshot.afterStateDigest) reasons.push("after_state_changed");
    if (current.decisionDigest !== snapshot.decisionDigest) reasons.push("decision_digest_changed");
    if (current.operationDigest !== snapshot.operationDigest) reasons.push("operation_digest_changed");
    if (!samePolicy(current.policy, snapshot.policy)) reasons.push("audit_policy_changed");
    if (!sameStrings(current.dependencyDigests, snapshot.dependencyDigests)) {
      reasons.push("dependency_digest_set_changed");
    }
    if (!sameFence(current.fence, snapshot.fence)) reasons.push("fence_binding_changed");
    if (!current.auditAvailable) reasons.push("audit_unavailable");
    if (!current.actorAuthorized) reasons.push("actor_unauthorized");
    if (!current.eventCurrent) reasons.push("event_not_current");
    if (current.evaluatedAt < snapshot.occurredAt) reasons.push("evaluation_precedes_event");

    if (current.existingRecord) {
      const record = current.existingRecord;
      if (record.id !== snapshot.recordId || record.envelopeDigest !== artifact.digest
        || record.workspaceId !== snapshot.workspaceId || record.action !== snapshot.action
        || record.subjectId !== snapshot.subject.id) reasons.push("audit_record_mismatch");
      if (record.recordedAt < snapshot.occurredAt || record.recordedAt > current.evaluatedAt) {
        reasons.push("audit_record_time_invalid");
      }
    }

    const reasonCodes = deepFreeze([...new Set(reasons)].sort());
    const rejected = reasonCodes.length > 0;
    const replay = !rejected && current.existingRecord !== null;
    return deepFreeze({
      kind: "synthetic_outreach_audit_append_decision" as const,
      status: rejected
        ? "synthetic_audit_rejected" as const
        : replay
          ? "synthetic_audit_already_durable_no_authority" as const
          : "synthetic_audit_append_required_no_authority" as const,
      envelopeId: snapshot.id,
      envelopeDigest: artifact.digest,
      reasonCodes,
      auditRecordProjection: deepFreeze({
        id: snapshot.recordId,
        envelopeDigest: artifact.digest,
        workspaceId: snapshot.workspaceId,
        companyId: snapshot.companyId,
        actorKind: snapshot.actor.kind,
        actorId: snapshot.actor.id,
        action: snapshot.action,
        subjectKind: snapshot.subject.kind,
        subjectId: snapshot.subject.id,
        subjectDigest: snapshot.subject.digest,
        resultCode: snapshot.resultCode,
        occurredAt: snapshot.occurredAt,
      }),
      requiredOrderedSteps: deepFreeze(!rejected && !replay ? ["append_minimized_audit_record"] : []),
      auditPersistenceAuthorized: false as const,
      loggerInvocationAuthorized: false as const,
      externalSinkAuthorized: false as const,
      providerInvocationAuthorized: false as const,
      effects: ZERO_EFFECTS,
    });
  } catch {
    throw new Error("synthetic_outreach_audit_decision_invalid");
  }
}

function normalizeSnapshot(value: unknown): Snapshot {
  const input = exactRecord(value, [
    "id", "recordId", "workspaceId", "companyId", "actor", "action", "subject", "resultCode", "reasonCodes",
    "beforeStateDigest", "afterStateDigest", "decisionDigest", "operationDigest", "policy", "dependencyDigests",
    "fence", "occurredAt",
  ]);
  const action = enumValue(input.action, Object.keys(ACTIONS) as Action[]);
  const actor = normalizeActor(input.actor);
  const subject = normalizeSubject(input.subject);
  const [subjectKind, actorKind, fenceRequired] = ACTIONS[action];
  if (subject.kind !== subjectKind || actor.kind !== actorKind) invalid();
  const fence = normalizeFence(input.fence);
  if ((fence !== null) !== fenceRequired) invalid();
  return deepFreeze({
    id: syntheticId(input.id), recordId: syntheticId(input.recordId), workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId), actor, action, subject, resultCode: safeCode(input.resultCode),
    reasonCodes: sortedCodes(input.reasonCodes, 0, 64), beforeStateDigest: nullableDigest(input.beforeStateDigest),
    afterStateDigest: nullableDigest(input.afterStateDigest), decisionDigest: digest(input.decisionDigest),
    operationDigest: digest(input.operationDigest), policy: normalizePolicy(input.policy),
    dependencyDigests: sortedDigests(input.dependencyDigests, 0, 64), fence, occurredAt: timestamp(input.occurredAt),
  });
}

function normalizeAuthority(value: unknown) {
  const input = exactRecord(value, [
    "evaluatedAt", "workspaceId", "companyId", "actor", "action", "subject", "resultCode", "reasonCodes",
    "beforeStateDigest", "afterStateDigest", "decisionDigest", "operationDigest", "policy", "dependencyDigests",
    "fence", "auditAvailable", "actorAuthorized", "eventCurrent", "existingRecord",
  ]);
  return deepFreeze({
    evaluatedAt: timestamp(input.evaluatedAt), workspaceId: syntheticId(input.workspaceId),
    companyId: syntheticId(input.companyId), actor: normalizeActor(input.actor),
    action: enumValue(input.action, Object.keys(ACTIONS) as Action[]), subject: normalizeSubject(input.subject),
    resultCode: safeCode(input.resultCode), reasonCodes: sortedCodes(input.reasonCodes, 0, 64),
    beforeStateDigest: nullableDigest(input.beforeStateDigest), afterStateDigest: nullableDigest(input.afterStateDigest),
    decisionDigest: digest(input.decisionDigest), operationDigest: digest(input.operationDigest),
    policy: normalizePolicy(input.policy), dependencyDigests: sortedDigests(input.dependencyDigests, 0, 64),
    fence: normalizeFence(input.fence), auditAvailable: booleanValue(input.auditAvailable),
    actorAuthorized: booleanValue(input.actorAuthorized), eventCurrent: booleanValue(input.eventCurrent),
    existingRecord: input.existingRecord === null ? null : normalizeExistingRecord(input.existingRecord),
  });
}

function normalizeActor(value: unknown): Actor {
  const input = exactRecord(value, ["kind", "id"]);
  return deepFreeze({
    kind: enumValue(input.kind, ["synthetic_owner", "synthetic_system", "synthetic_public"] as const),
    id: syntheticId(input.id),
  });
}

function normalizeSubject(value: unknown): Subject {
  const input = exactRecord(value, ["kind", "id", "digest"]);
  return deepFreeze({ kind: safeCode(input.kind), id: syntheticId(input.id), digest: digest(input.digest) });
}

function normalizePolicy(value: unknown): Policy {
  const input = exactRecord(value, ["id", "digest", "reasonCodeRegistryDigest"]);
  return deepFreeze({
    id: syntheticId(input.id), digest: digest(input.digest), reasonCodeRegistryDigest: digest(input.reasonCodeRegistryDigest),
  });
}

function normalizeFence(value: unknown): Fence {
  if (value === null) return null;
  const input = exactRecord(value, ["leaseGeneration", "dispatchKeyDigest"]);
  return deepFreeze({ leaseGeneration: positiveInteger(input.leaseGeneration), dispatchKeyDigest: digest(input.dispatchKeyDigest) });
}

function normalizeExistingRecord(value: unknown) {
  const input = exactRecord(value, ["id", "envelopeDigest", "workspaceId", "action", "subjectId", "recordedAt"]);
  return deepFreeze({
    id: syntheticId(input.id), envelopeDigest: digest(input.envelopeDigest), workspaceId: syntheticId(input.workspaceId),
    action: enumValue(input.action, Object.keys(ACTIONS) as Action[]), subjectId: syntheticId(input.subjectId),
    recordedAt: timestamp(input.recordedAt),
  });
}

function sameActor(left: Actor, right: Actor) { return left.kind === right.kind && left.id === right.id; }
function sameSubject(left: Subject, right: Subject) {
  return left.kind === right.kind && left.id === right.id && left.digest === right.digest;
}
function samePolicy(left: Policy, right: Policy) {
  return left.id === right.id && left.digest === right.digest
    && left.reasonCodeRegistryDigest === right.reasonCodeRegistryDigest;
}
function sameFence(left: Fence, right: Fence) {
  return left === null || right === null
    ? left === right
    : left.leaseGeneration === right.leaseGeneration && left.dispatchKeyDigest === right.dispatchKeyDigest;
}
function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function exactRecord(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  if (Object.keys(descriptors).sort().join("\0") !== [...expectedKeys].sort().join("\0")) invalid();
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function denseArray(value: unknown, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string")) invalid();
  const expected = [...Array(value.length).keys()].map(String);
  const actual = Object.keys(descriptors).filter((key) => key !== "length");
  if (actual.sort().join("\0") !== expected.sort().join("\0")) invalid();
  return expected.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    return descriptor.value;
  });
}

function sortedCodes(value: unknown, minimum: number, maximum: number) {
  const entries = denseArray(value, minimum, maximum).map(safeCode).sort();
  if (new Set(entries).size !== entries.length) invalid();
  return deepFreeze(entries);
}
function sortedDigests(value: unknown, minimum: number, maximum: number) {
  const entries = denseArray(value, minimum, maximum).map(digest).sort();
  if (new Set(entries).size !== entries.length) invalid();
  return deepFreeze(entries);
}
function syntheticId(value: unknown) {
  if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) invalid();
  return value;
}
function safeCode(value: unknown) {
  if (typeof value !== "string" || !SAFE_CODE.test(value) || SENSITIVE_CODE.test(value)) invalid();
  return value;
}
function digest(value: unknown) {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}
function nullableDigest(value: unknown) { return value === null ? null : digest(value); }
function timestamp(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid();
  return value as number;
}
function positiveInteger(value: unknown) { return timestamp(value); }
function booleanValue(value: unknown) {
  if (typeof value !== "boolean") invalid();
  return value;
}
function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) invalid();
  return value as T[number];
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
function invalid(): never { throw new Error("invalid"); }
