import { v7 } from "uuid";
import { canonicalDigest } from "./enrichment-grant-issuance";
import {
  productionPersonDiscoveryPort,
  type PersonDiscoveryAssignment,
  type PersonDiscoveryPort,
} from "./person-discovery-port";
import {
  commitDiscoveryDecision,
  commitVerificationIntent,
  completeDiscoveryRun,
  createDiscoveryRun,
  deriveContactFreshnessPolicy,
  hasNewerTrustedFreshObservation,
  isDiscoveryRunAuthorityCurrent,
  loadApprovedProspectAuthority,
  loadRefreshObservation,
  loadRelevanceAuthority,
  markDiscoveryNeedsReconciliation,
  reconcileStaleRequestedRun,
  redactExpiredPersonDiscoveryPayloads,
  readDecisionByIdempotency,
  readDiscoveryRun,
  readDiscoveryRunByIdempotency,
  readDiscoveryRunByRequestDigest,
  readVerificationIntentByIdempotency,
  type DiscoveryCandidateRecord,
  type DiscoveryDecisionRecord,
  type DiscoveryRunRecord,
  type PersonDiscoveryScope,
  type VerificationIntentRecord,
} from "./person-discovery-repository";

export { productionPersonDiscoveryPort };

export const PERSON_DISCOVERY_MAX_CANDIDATES = 20;
export const PERSON_DISCOVERY_MAX_PROVENANCE = 8;
export const PERSON_DISCOVERY_MAX_RESULT_BYTES = 65_536;
export const PERSON_DISCOVERY_CANDIDATE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const PERSON_DISCOVERY_PROVENANCE_RETENTION_MS = 730 * 24 * 60 * 60 * 1000;

export type StartPersonDiscoveryCommand = Readonly<{
  prospectId: string;
  expectedProspectRevision: number;
  expectedConfigurationId: string;
  expectedConfigurationDigest: string;
  expectedConfigurationRevision: number;
  maxCandidates: number;
  maxProvenancePerCandidate: number;
  idempotencyKey: string;
}>;

export type PersonDiscoveryResult = Readonly<
  | { kind: "accepted"; run: DiscoveryRunRecord; replayed: boolean }
  | { kind: "blocked"; reason: "invalid_request" | "port_unavailable" | "stale_or_foreign_authority" }
  | { kind: "conflict"; reason: "idempotency_conflict" | "write_conflict" }
>;

export type DecidePersonDiscoveryCommand = Readonly<{
  runId: string;
  expectedResultDigest: string;
  decision: "no_match" | "create_new" | "link_existing";
  candidateId?: string;
  existingContactId?: string;
  idempotencyKey: string;
}>;

export type PersonDiscoveryDecisionResult = Readonly<
  | { kind: "accepted"; decision: DiscoveryDecisionRecord; replayed: boolean }
  | { kind: "blocked"; reason: "invalid_request" | "stale_or_foreign_authority" | "candidate_unavailable" }
  | { kind: "conflict"; reason: "idempotency_conflict" | "ambiguous_identity_or_race" }
>;

export type RecordVerificationIntentCommand = Readonly<{
  relevanceId: string;
  intent: "initial_verification" | "stale_refresh";
  channel: "email" | "phone";
  sourceObservationId?: string;
  expectedProspectRevision: number;
  expectedContactRevision: number;
  expectedConfigurationId: string;
  expectedConfigurationDigest: string;
  expectedConfigurationRevision: number;
  idempotencyKey: string;
}>;

export type VerificationIntentResult = Readonly<
  | { kind: "accepted"; intent: VerificationIntentRecord; replayed: boolean; providerCallAuthorized: false; contactEvidenceCreated: false }
  | { kind: "blocked"; reason: "invalid_request" | "stale_or_foreign_authority" }
  | { kind: "conflict"; reason: "idempotency_conflict" | "write_conflict" }
>;

export type PersonDiscoveryService = Readonly<{
  start(scope: PersonDiscoveryScope, command: StartPersonDiscoveryCommand | unknown): Promise<PersonDiscoveryResult>;
  decide(scope: PersonDiscoveryScope, command: DecidePersonDiscoveryCommand | unknown): Promise<PersonDiscoveryDecisionResult>;
  recordVerificationIntent(scope: PersonDiscoveryScope, command: RecordVerificationIntentCommand | unknown): Promise<VerificationIntentResult>;
  redactExpiredPayloads(scope: PersonDiscoveryScope): Promise<Readonly<{ redacted: number }>>;
}>;

type ServiceOptions = Readonly<{
  database: D1Database;
  port?: PersonDiscoveryPort | typeof productionPersonDiscoveryPort;
  now?: () => number;
  idFactory?: () => string;
  requestTimeoutMs?: number;
}>;

type NormalizedCandidate = Readonly<{
  displayName: string;
  roleTitle: string;
  roleSummary: string;
  provenance: readonly Readonly<{ sourceReference: string; excerpt: string; retrievedAt: number }>[];
}>;

type InFlight = Readonly<{ digest: string; promise: Promise<PersonDiscoveryResult> }>;

export function createPersonDiscoveryService(options: ServiceOptions): PersonDiscoveryService {
  const now = options.now ?? Date.now;
  const idFactory = options.idFactory ?? v7;
  const port = options.port ?? productionPersonDiscoveryPort;
  const requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
  if (!integerBetween(requestTimeoutMs, 1, 30_000)) throw new TypeError("invalid_person_discovery_timeout");
  const inFlight = new Map<string, InFlight>();
  async function replayOrReconcile(scope: PersonDiscoveryScope, run: DiscoveryRunRecord): Promise<PersonDiscoveryResult> {
    if (run.status !== "requested") return acceptedDiscovery(run, true);
    const observedAt = safeNow(now());
    if (run.requestedDeadlineAt > observedAt) return acceptedDiscovery(run, true);
    const recovered = await reconcileStaleRequestedRun(
      options.database, scope, run.id, run.requestDigest, idFactory(),
      await canonicalDigest({ schema: "person-discovery-uncertain/v1", requestDigest: run.requestDigest, outcome: "stale_requested" }), observedAt,
    );
    if (!recovered) throw new Error("person_discovery_requested_recovery_failed");
    return acceptedDiscovery(recovered, true);
  }

  return Object.freeze({
    async start(scope, value) {
      const command = normalizeStart(value);
      if (!validScope(scope) || !command) return blockedDiscovery("invalid_request");
      const requestMaterial = {
        schema: "person-discovery-request/v1",
        workspaceId: scope.workspaceId,
        principalSubject: scope.principalSubject,
        prospectId: command.prospectId,
        expectedProspectRevision: command.expectedProspectRevision,
        expectedConfigurationId: command.expectedConfigurationId,
        expectedConfigurationDigest: command.expectedConfigurationDigest,
        expectedConfigurationRevision: command.expectedConfigurationRevision,
        maxCandidates: command.maxCandidates,
        maxProvenancePerCandidate: command.maxProvenancePerCandidate,
      } as const;
      const requestDigest = await canonicalDigest(requestMaterial);
      const operationKey = `pd_${requestDigest}`;
      const prior = await readDiscoveryRunByIdempotency(options.database, scope, command.idempotencyKey);
      if (prior) {
        if (prior.requestDigest !== requestDigest) return conflictDiscovery("idempotency_conflict");
        return replayOrReconcile(scope, prior);
      }
      const semanticPrior = await readDiscoveryRunByRequestDigest(options.database, scope, requestDigest, operationKey);
      if (semanticPrior) return replayOrReconcile(scope, semanticPrior);
      const inFlightKey = `${scope.workspaceId.length}:${scope.workspaceId}:${command.idempotencyKey}`;
      const active = inFlight.get(inFlightKey);
      if (active) return active.digest === requestDigest
        ? replayInFlight(active.promise)
        : conflictDiscovery("idempotency_conflict");
      const promise = executeDiscovery(options.database, port, scope, command, requestDigest, operationKey, requestTimeoutMs, now, idFactory);
      inFlight.set(inFlightKey, { digest: requestDigest, promise });
      try { return await promise; } finally { inFlight.delete(inFlightKey); }
    },

    async decide(scope, value) {
      const command = normalizeDecision(value);
      if (!validScope(scope) || !command) return blockedDecision("invalid_request");
      const decisionMaterial = {
        schema: "person-discovery-owner-decision/v1",
        workspaceId: scope.workspaceId,
        principalSubject: scope.principalSubject,
        runId: command.runId,
        expectedResultDigest: command.expectedResultDigest,
        decision: command.decision,
        candidateId: command.candidateId ?? null,
        existingContactId: command.existingContactId ?? null,
      } as const;
      const decisionDigest = await canonicalDigest(decisionMaterial);
      const prior = await readDecisionByIdempotency(options.database, scope, command.idempotencyKey);
      if (prior) return prior.decisionDigest === decisionDigest
        ? acceptedDecision(prior, true)
        : conflictDecision("idempotency_conflict");
      const run = await readDiscoveryRun(options.database, scope, command.runId);
      if (!run || run.status !== "completed" || run.resultDigest !== command.expectedResultDigest) return blockedDecision("stale_or_foreign_authority");
      if (!await isDiscoveryRunAuthorityCurrent(options.database, scope, command.runId)) return blockedDecision("stale_or_foreign_authority");
      const candidate = command.candidateId ? run.candidates.find((item) => item.id === command.candidateId) : null;
      // The database trigger repeats this fence at commit time.  Keeping the
      // same boundary here produces a deterministic, payload-safe denial at
      // and after expiry even when retention has not physically redacted yet.
      const candidateCurrent = candidate
        && candidate.redactedAt === null
        && candidate.payloadExpiresAt > safeNow(now());
      if (command.decision !== "no_match" && !candidateCurrent) return blockedDecision("candidate_unavailable");
      const contactId = command.decision === "create_new" ? idFactory() : command.existingContactId ?? null;
      const relevanceId = command.decision === "no_match" ? null : idFactory();
      const relevanceDigest = candidate && contactId
        ? await canonicalDigest({ schema: "prospect-contact-role-relevance/v1", workspaceId: scope.workspaceId, runId: run.id, candidateDigest: candidate.candidateDigest, contactId, decisionDigest })
        : null;
      try {
        const committed = await commitDiscoveryDecision(options.database, {
          id: idFactory(), authorityCommandId: idFactory(), auditEventId: idFactory(), relevanceId, contactId,
          newContactIdentityDigest: command.decision === "create_new" && candidate
            ? await canonicalDigest({ schema: "person-discovery-contact-identity/v1", workspaceId: scope.workspaceId, candidateDigest: candidate.candidateDigest })
            : null,
          scope, runId: run.id, candidateId: candidate?.id ?? null, decision: command.decision,
          expectedResultDigest: command.expectedResultDigest, idempotencyKey: command.idempotencyKey,
          decisionDigest, relevanceDigest, createdAt: safeNow(now()),
        });
        return acceptedDecision(committed, false);
      } catch (error) {
        const winner = await readDecisionByIdempotency(options.database, scope, command.idempotencyKey);
        if (winner) return winner.decisionDigest === decisionDigest
          ? acceptedDecision(winner, true)
          : conflictDecision("idempotency_conflict");
        if (!await isDiscoveryRunAuthorityCurrent(options.database, scope, command.runId)) return blockedDecision("stale_or_foreign_authority");
        if (isConstraintError(error)) return conflictDecision("ambiguous_identity_or_race");
        throw error;
      }
    },

    async recordVerificationIntent(scope, value) {
      const command = normalizeVerificationIntent(value);
      if (!validScope(scope) || !command) return blockedIntent("invalid_request");
      const authority = await loadRelevanceAuthority(options.database, scope, command.relevanceId);
      if (!authority
        || authority.prospectRevision !== command.expectedProspectRevision
        || authority.contactRevision !== command.expectedContactRevision
        || authority.configurationId !== command.expectedConfigurationId
        || authority.configurationDigest !== command.expectedConfigurationDigest
        || authority.configurationRevision !== command.expectedConfigurationRevision) return blockedIntent("stale_or_foreign_authority");
      const policy = await deriveContactFreshnessPolicy(authority.configurationManifestJson);
      if (!policy) return blockedIntent("stale_or_foreign_authority");
      const prior = await readVerificationIntentByIdempotency(options.database, scope, command.idempotencyKey);
      if (prior && (prior.intent !== command.intent || prior.channel !== command.channel || prior.sourceObservationId !== (command.sourceObservationId ?? null))) return conflictIntent("idempotency_conflict");
      let freshnessWindowMs = command.channel === "phone" ? policy.verifiedBusinessPhoneFreshnessMs : policy.mailboxVerifiedEmailFreshnessMs;
      if (command.intent === "stale_refresh") {
        const observation = await loadRefreshObservation(options.database, authority, command.sourceObservationId!);
        if (!observation || observation.kind !== command.channel) return blockedIntent("stale_or_foreign_authority");
        freshnessWindowMs = observation.verificationClass === "mailbox_verified"
          ? policy.mailboxVerifiedEmailFreshnessMs
          : observation.kind === "phone" ? policy.verifiedBusinessPhoneFreshnessMs : policy.sourceVerifiedEmailFreshnessMs;
        const observedNow = safeNow(now());
        if (observedNow < observation.verifiedAt + freshnessWindowMs) return blockedIntent("stale_or_foreign_authority");
        if (await hasNewerTrustedFreshObservation(options.database, authority, command.sourceObservationId!, command.channel, observedNow, policy)) return blockedIntent("stale_or_foreign_authority");
      }
      const freshnessPolicyDigest = policy.policyDigest;
      const material = {
        schema: "contact-verification-intent/v1",
        workspaceId: scope.workspaceId,
        principalSubject: scope.principalSubject,
        relevanceId: command.relevanceId,
        intent: command.intent,
        channel: command.channel,
        sourceObservationId: command.sourceObservationId ?? null,
        expectedProspectRevision: command.expectedProspectRevision,
        expectedContactRevision: command.expectedContactRevision,
        expectedConfigurationId: command.expectedConfigurationId,
        expectedConfigurationDigest: command.expectedConfigurationDigest,
        expectedConfigurationRevision: command.expectedConfigurationRevision,
        freshnessWindowMs,
        freshnessPolicyDigest,
      } as const;
      const intentDigest = await canonicalDigest(material);
      if (prior) return prior.intentDigest === intentDigest
        ? acceptedIntent(prior, true)
        : conflictIntent("idempotency_conflict");
      try {
        const committed = await commitVerificationIntent(options.database, authority, {
          id: idFactory(), authorityCommandId: idFactory(), auditEventId: idFactory(), intent: command.intent, channel: command.channel,
          sourceObservationId: command.sourceObservationId ?? null, freshnessWindowMs, freshnessPolicyDigest,
          idempotencyKey: command.idempotencyKey, intentDigest, createdAt: safeNow(now()),
        });
        return acceptedIntent(committed, false);
      } catch (error) {
        const winner = await readVerificationIntentByIdempotency(options.database, scope, command.idempotencyKey);
        if (winner) return winner.intentDigest === intentDigest
          ? acceptedIntent(winner, true)
          : conflictIntent("idempotency_conflict");
        const current = await loadRelevanceAuthority(options.database, scope, command.relevanceId);
        if (!current) return blockedIntent("stale_or_foreign_authority");
        if (isConstraintError(error)) return conflictIntent("write_conflict");
        throw error;
      }
    },

    async redactExpiredPayloads(scope) {
      if (!validScope(scope)) return Object.freeze({ redacted: 0 });
      return Object.freeze({ redacted: await redactExpiredPersonDiscoveryPayloads(options.database, scope, safeNow(now()), idFactory) });
    },
  });
}

async function executeDiscovery(
  database: D1Database,
  port: ServiceOptions["port"],
  scope: PersonDiscoveryScope,
  command: StartPersonDiscoveryCommand,
  requestDigest: string,
  operationKey: string,
  requestTimeoutMs: number,
  now: () => number,
  idFactory: () => string,
): Promise<PersonDiscoveryResult> {
  if (!isTestPersonDiscoveryPort(port)) return blockedDiscovery("port_unavailable");
  const authority = await loadApprovedProspectAuthority(database, scope, command.prospectId);
  if (!authority
    || authority.prospectRevision !== command.expectedProspectRevision
    || authority.configurationId !== command.expectedConfigurationId
    || authority.configurationDigest !== command.expectedConfigurationDigest
    || authority.configurationRevision !== command.expectedConfigurationRevision) return blockedDiscovery("stale_or_foreign_authority");
  const runId = idFactory();
  const startedAt = safeNow(now());
  const deadlineAt = startedAt + requestTimeoutMs;
  let run: DiscoveryRunRecord;
  try {
    run = await createDiscoveryRun(database, {
      id: runId, eventId: idFactory(), authority,
      maxCandidates: command.maxCandidates, maxProvenancePerCandidate: command.maxProvenancePerCandidate,
      idempotencyKey: command.idempotencyKey, operationKey, requestDigest, requestedDeadlineAt: deadlineAt, createdAt: startedAt,
    });
  } catch (error) {
    const winner = await readDiscoveryRunByIdempotency(database, scope, command.idempotencyKey);
    if (winner) return winner.requestDigest === requestDigest
      ? acceptedDiscovery(winner, true)
      : conflictDiscovery("idempotency_conflict");
    const equivalent = await readDiscoveryRunByRequestDigest(database, scope, requestDigest, operationKey);
    if (equivalent) {
      const observedAt = safeNow(now());
      if (equivalent.status === "requested" && equivalent.requestedDeadlineAt <= observedAt) {
        const recovered = await reconcileStaleRequestedRun(database, scope, equivalent.id, requestDigest, idFactory(), await canonicalDigest({ schema: "person-discovery-uncertain/v1", requestDigest, outcome: "stale_requested" }), observedAt);
        if (!recovered) throw new Error("person_discovery_requested_recovery_failed");
        return acceptedDiscovery(recovered, true);
      }
      return acceptedDiscovery(equivalent, true);
    }
    throw error;
  }
  const assignment: PersonDiscoveryAssignment = Object.freeze({
    schema: "person-discovery-assignment/v1",
    runId,
    operationKey,
    prospectId: authority.prospectId,
    profileId: authority.profileId,
    configurationId: authority.configurationId,
    configurationDigest: authority.configurationDigest,
    configurationRevision: authority.configurationRevision,
    prospectRevision: authority.prospectRevision,
    deadlineAt,
    maxCandidates: command.maxCandidates,
    maxProvenancePerCandidate: command.maxProvenancePerCandidate,
  });
  let raw: unknown;
  try {
    raw = await invokeWithDeadline(port, assignment, requestTimeoutMs);
  } catch (error) {
    const timedOut = error instanceof PersonDiscoveryDeadlineError;
    run = await markDiscoveryNeedsReconciliation(database, scope, runId, idFactory(), await canonicalDigest({ schema: "person-discovery-uncertain/v1", requestDigest, outcome: timedOut ? "timeout" : "provider_exception" }), timedOut ? "timeout" : "unknown_outcome", safeNow(now()));
    return acceptedDiscovery(run, false);
  }
  const completionTime = safeNow(now());
  if (timeoutOutcome(raw)) {
    run = await markDiscoveryNeedsReconciliation(database, scope, runId, idFactory(), await canonicalDigest({ schema: "person-discovery-uncertain/v1", requestDigest, outcome: raw.kind }), raw.kind === "timeout" ? "timeout" : "unknown_outcome", completionTime);
    return acceptedDiscovery(run, false);
  }
  const candidates = await normalizePortOutcome(raw, runId, requestDigest, command, completionTime, idFactory);
  if (!candidates) {
    run = await markDiscoveryNeedsReconciliation(database, scope, runId, idFactory(), await canonicalDigest({ schema: "person-discovery-uncertain/v1", requestDigest, outcome: "malformed" }), "unknown_outcome", completionTime);
    return acceptedDiscovery(run, false);
  }
  if (!await isDiscoveryRunAuthorityCurrent(database, scope, runId)) {
    run = await markDiscoveryNeedsReconciliation(database, scope, runId, idFactory(), await canonicalDigest({ schema: "person-discovery-uncertain/v1", requestDigest, outcome: "authority_drift" }), "unknown_outcome", completionTime);
    return acceptedDiscovery(run, false);
  }
  const resultDigest = await canonicalDigest({
    schema: "person-discovery-result/v1",
    requestDigest,
    candidates: candidates.map((candidate) => ({ candidateDigest: candidate.candidateDigest, provenanceDigests: candidate.provenance.map((item) => item.provenanceDigest) })),
  });
  try {
    run = await completeDiscoveryRun(database, scope, runId, idFactory(), candidates, resultDigest, completionTime);
    return acceptedDiscovery(run, false);
  } catch (error) {
    if (await isDiscoveryRunAuthorityCurrent(database, scope, runId)) throw error;
    run = await markDiscoveryNeedsReconciliation(database, scope, runId, idFactory(), await canonicalDigest({ schema: "person-discovery-uncertain/v1", requestDigest, outcome: "authority_drift" }), "unknown_outcome", completionTime);
    return acceptedDiscovery(run, false);
  }
}

async function invokeWithDeadline(port: PersonDiscoveryPort, assignment: PersonDiscoveryAssignment, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      port.discover(assignment, controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new PersonDiscoveryDeadlineError()); controller.abort(); }, timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

class PersonDiscoveryDeadlineError extends Error {
  constructor() { super("person_discovery_deadline_exceeded"); }
}

async function normalizePortOutcome(
  value: unknown,
  runId: string,
  requestDigest: string,
  command: StartPersonDiscoveryCommand,
  completionTime: number,
  idFactory: () => string,
): Promise<readonly DiscoveryCandidateRecord[] | null> {
  if (!record(value) || !exactKeys(value, ["candidates", "kind"]) || value.kind !== "completed" || !Array.isArray(value.candidates)) return null;
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { return null; }
  if (new TextEncoder().encode(encoded).byteLength > PERSON_DISCOVERY_MAX_RESULT_BYTES || value.candidates.length > command.maxCandidates) return null;
  const normalized: DiscoveryCandidateRecord[] = [];
  const candidateKeys = new Set<string>();
  const candidateDigests = new Set<string>();
  for (let ordinal = 0; ordinal < value.candidates.length; ordinal += 1) {
    const candidate = normalizeCandidate(value.candidates[ordinal], command.maxProvenancePerCandidate, completionTime);
    if (!candidate) return null;
    const candidateKey = `candidate:${await canonicalDigest({ schema: "person-discovery-candidate-key/v1", displayName: candidate.displayName, roleTitle: candidate.roleTitle, roleSummary: candidate.roleSummary })}`;
    if (candidateKeys.has(candidateKey)) return null;
    candidateKeys.add(candidateKey);
    const candidateDigest = await canonicalDigest({
      schema: "person-discovery-candidate/v1",
      requestDigest,
      ordinal,
      candidateKey,
      displayName: candidate.displayName,
      roleTitle: candidate.roleTitle,
      roleSummary: candidate.roleSummary,
    });
    if (candidateDigests.has(candidateDigest)) return null;
    candidateDigests.add(candidateDigest);
    const candidateId = idFactory();
    const provenance = [];
    for (let provenanceOrdinal = 0; provenanceOrdinal < candidate.provenance.length; provenanceOrdinal += 1) {
      const item = candidate.provenance[provenanceOrdinal];
      const sourceDigest = await canonicalDigest({ schema: "person-discovery-source/v1", sourceReference: item.sourceReference });
      const excerptDigest = await canonicalDigest({ schema: "person-discovery-excerpt/v1", excerpt: item.excerpt });
      provenance.push(Object.freeze({
        id: idFactory(), ordinal: provenanceOrdinal, sourceReference: item.sourceReference, excerpt: item.excerpt,
        sourceDigest, excerptDigest, retrievedAt: item.retrievedAt,
        payloadExpiresAt: completionTime + PERSON_DISCOVERY_PROVENANCE_RETENTION_MS,
        redactedAt: null,
        provenanceDigest: await canonicalDigest({ schema: "person-discovery-provenance/v1", runId, candidateDigest, ordinal: provenanceOrdinal, sourceDigest, excerptDigest, retrievedAt: item.retrievedAt }),
      }));
    }
    normalized.push(Object.freeze({ id: candidateId, ordinal, candidateKey, displayName: candidate.displayName, roleTitle: candidate.roleTitle, roleSummary: candidate.roleSummary, candidateDigest, payloadExpiresAt: completionTime + PERSON_DISCOVERY_CANDIDATE_RETENTION_MS, redactedAt: null, provenance: Object.freeze(provenance) }));
  }
  return Object.freeze(normalized);
}

function normalizeCandidate(value: unknown, maxProvenance: number, completionTime: number): NormalizedCandidate | null {
  if (!record(value) || !exactKeys(value, ["displayName", "provenance", "roleSummary", "roleTitle"])) return null;
  if (!safeBusinessProse(value.displayName, 160) || !safeBusinessProse(value.roleTitle, 160) || !safeBusinessProse(value.roleSummary, 1000)) return null;
  if (!Array.isArray(value.provenance) || value.provenance.length < 1 || value.provenance.length > maxProvenance) return null;
  const provenance: { sourceReference: string; excerpt: string; retrievedAt: number }[] = [];
  const sources = new Set<string>();
  for (const item of value.provenance) {
    if (!record(item) || !exactKeys(item, ["excerpt", "retrievedAt", "sourceReference"])) return null;
    if (!safeSourceReference(item.sourceReference, 512) || !safeBusinessProse(item.excerpt, 2000) || !safeTimestamp(item.retrievedAt) || item.retrievedAt > completionTime) return null;
    if (sources.has(item.sourceReference)) return null;
    sources.add(item.sourceReference);
    provenance.push({ sourceReference: item.sourceReference, excerpt: item.excerpt, retrievedAt: item.retrievedAt });
  }
  return Object.freeze({ displayName: value.displayName, roleTitle: value.roleTitle, roleSummary: value.roleSummary, provenance: Object.freeze(provenance) });
}

function normalizeStart(value: unknown): StartPersonDiscoveryCommand | null {
  if (!record(value) || !exactKeys(value, ["expectedConfigurationDigest", "expectedConfigurationId", "expectedConfigurationRevision", "expectedProspectRevision", "idempotencyKey", "maxCandidates", "maxProvenancePerCandidate", "prospectId"])) return null;
  if (!opaque(value.prospectId) || !safeRevision(value.expectedProspectRevision) || !opaque(value.expectedConfigurationId) || !digest(value.expectedConfigurationDigest) || !safeRevision(value.expectedConfigurationRevision) || !integerBetween(value.maxCandidates, 1, PERSON_DISCOVERY_MAX_CANDIDATES) || !integerBetween(value.maxProvenancePerCandidate, 1, PERSON_DISCOVERY_MAX_PROVENANCE) || !idempotency(value.idempotencyKey)) return null;
  return value as StartPersonDiscoveryCommand;
}

function normalizeDecision(value: unknown): DecidePersonDiscoveryCommand | null {
  if (!record(value) || !exactKeys(value, ["candidateId", "decision", "existingContactId", "expectedResultDigest", "idempotencyKey", "runId"], true)) return null;
  if (!opaque(value.runId) || !digest(value.expectedResultDigest) || !idempotency(value.idempotencyKey) || (value.decision !== "no_match" && value.decision !== "create_new" && value.decision !== "link_existing")) return null;
  const candidateId = value.candidateId;
  const contactId = value.existingContactId;
  if (value.decision === "no_match" && (candidateId !== undefined || contactId !== undefined)) return null;
  if (value.decision === "create_new" && (!opaque(candidateId) || contactId !== undefined)) return null;
  if (value.decision === "link_existing" && (!opaque(candidateId) || !opaque(contactId))) return null;
  return value as DecidePersonDiscoveryCommand;
}

function normalizeVerificationIntent(value: unknown): RecordVerificationIntentCommand | null {
  if (!record(value) || !exactKeys(value, ["channel", "expectedConfigurationDigest", "expectedConfigurationId", "expectedConfigurationRevision", "expectedContactRevision", "expectedProspectRevision", "idempotencyKey", "intent", "relevanceId", "sourceObservationId"], true)) return null;
  if (!opaque(value.relevanceId) || (value.intent !== "initial_verification" && value.intent !== "stale_refresh") || (value.channel !== "email" && value.channel !== "phone") || !safeRevision(value.expectedProspectRevision) || !safeRevision(value.expectedContactRevision) || !opaque(value.expectedConfigurationId) || !digest(value.expectedConfigurationDigest) || !safeRevision(value.expectedConfigurationRevision) || !idempotency(value.idempotencyKey)) return null;
  if (value.intent === "initial_verification" && value.sourceObservationId !== undefined) return null;
  if (value.intent === "stale_refresh" && !opaque(value.sourceObservationId)) return null;
  return value as RecordVerificationIntentCommand;
}

function validScope(scope: unknown): scope is PersonDiscoveryScope { return record(scope) && exactKeys(scope, ["principalSubject", "workspaceId"]) && opaque(scope.workspaceId) && canonicalText(scope.principalSubject, 256); }
function timeoutOutcome(value: unknown): value is { kind: "timeout" | "unknown" } { return record(value) && exactKeys(value, ["kind"]) && (value.kind === "timeout" || value.kind === "unknown"); }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[], optional = false): boolean { const actual = Object.keys(value).sort(); const permitted = [...allowed].sort(); return optional ? actual.every((key) => permitted.includes(key)) && permitted.filter((key) => !["candidateId", "existingContactId", "sourceObservationId"].includes(key)).every((key) => actual.includes(key)) : actual.join(",") === permitted.join(","); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function canonicalText(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim() && value === value.normalize("NFC") && !/[\u0000-\u001f\u007f]/u.test(value); }
function safeBusinessProse(value: unknown, max: number): value is string {
  if (!canonicalText(value, max) || !BUSINESS_PROSE_PATTERN.test(value)) return false;
  const layers = canonicalPercentLayers(value);
  if (!layers) return false;
  const decoded = layers.at(-1)!;
  return BUSINESS_PROSE_PATTERN.test(decoded) && !layers.some(sensitivePlain);
}
function safeSourceReference(value: unknown, max: number): value is string {
  if (!canonicalText(value, max)) return false;
  const layers = canonicalPercentLayers(value);
  if (!layers) return false;
  const decoded = layers.at(-1)!;
  if (layers.some(sensitivePlain)) return false;
  if (/^synthetic:[A-Za-z0-9._:-]+$/u.test(decoded)) return true;
  try {
    const parsed = new URL(decoded);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.search && !parsed.hash
      && !isIpLiteral(parsed.hostname) && !/(?:^|\.)(?:localhost|local|internal|lan)$/iu.test(parsed.hostname);
  } catch { return false; }
}
const BUSINESS_PROSE_PATTERN = /^[\p{L}\p{M}\p{N} .,;:!?"'“”‘’()&/+%–—-]+$/u;
const MAX_PERCENT_DECODE_ROUNDS = 4;
function canonicalPercentLayers(value: string): readonly string[] | null {
  const layers = [value];
  let current = value;
  for (let round = 0; round < MAX_PERCENT_DECODE_ROUNDS; round += 1) {
    if (!/%[0-9a-f]{2}/iu.test(current)) {
      return /%(?=[A-Za-z0-9])/u.test(current) ? null : Object.freeze(layers);
    }
    let decoded: string;
    try {
      decoded = current.replace(/(?:%[0-9a-f]{2})+/giu, (encoded) => decodeURIComponent(encoded));
    } catch { return null; }
    if (decoded === current) return null;
    layers.push(decoded);
    current = decoded;
  }
  return /%[0-9a-f]{2}/iu.test(current) || /%(?=[A-Za-z0-9])/u.test(current)
    ? null
    : Object.freeze(layers);
}
function sensitivePlain(value: string): boolean {
  const digits = value.replace(/\D/gu, "");
  const numberWords = value.match(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine)\b/giu)?.length ?? 0;
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+/iu.test(value)
    || /\b[A-Z0-9._%+-]+\s*(?:\[at\]|\(at\)|at)\s*[A-Z0-9.-]+\s*(?:\[dot\]|\(dot\)|dot)\s*[A-Z]{2,}\b/iu.test(value)
    || digits.length >= 7 || numberWords >= 7 || isIpLiteral(value)
    || /\bAKIA[0-9A-Z]{16}\b/u.test(value) || /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u.test(value)
    || /\b(?:sk-proj|sk-ant-api03)-[A-Za-z0-9_-]{12,}\b/u.test(value)
    || /\bxox[baprs]-[A-Za-z0-9-]{12,}\b/u.test(value) || /\bAIza[0-9A-Za-z_-]{20,}\b/u.test(value)
    || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u.test(value)
    || /\b(?:Basic|Bearer)\s+[A-Za-z0-9+/=_-]{8,}\b/iu.test(value)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(value)
    || /\b(?:api[ _-]?key|password|secret|access[ _-]?token|refresh[ _-]?token)\b/iu.test(value)
    || /\b(?:sk|pk)_[A-Za-z0-9_-]{16,}\b/u.test(value)
    || /\b[A-Za-z0-9+/_=-]{32,}\b/u.test(value)
    || /https?:\/\/[^\s/@]+:[^\s/@]+@/iu.test(value)
    || /https?:\/\/\S+\?(?:\S*&)?(?:token|key|secret|password|signature)=/iu.test(value);
}
function isIpLiteral(value: string): boolean { return /(?:^|[^\d])(?:\d{1,3}\.){3}\d{1,3}(?:$|[^\d])/u.test(value) || /^\[[0-9a-f:]+\]$/iu.test(value); }
function opaque(value: unknown): value is string { return canonicalText(value, 256); }
function idempotency(value: unknown): value is string { return canonicalText(value, 200) && value.length >= 8; }
function digest(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value); }
function safeRevision(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function safeTimestamp(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function integerBetween(value: unknown, min: number, max: number): value is number { return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max; }
function safeNow(value: number): number { if (!safeTimestamp(value)) throw new TypeError("invalid_person_discovery_clock"); return value; }
function isConstraintError(error: unknown): boolean { return error instanceof Error && /SQLITE_CONSTRAINT|constraint failed|invalid person discovery|invalid contact verification/u.test(error.message); }
function isTestPersonDiscoveryPort(value: unknown): value is PersonDiscoveryPort {
  if (import.meta.env.PROD || !record(value) || typeof value.discover !== "function") return false;
  if (value.kind === "test_injected") return (value as Record<PropertyKey, unknown>)[Symbol.for("prospector.person-discovery.test-port")] === true;
  return value.kind === "synthetic_acceptance"
    && (value as Record<PropertyKey, unknown>)[Symbol.for("prospector.person-discovery.c4-acceptance")] === "synthetic-zero-network-c4-v1";
}

function acceptedDiscovery(run: DiscoveryRunRecord, replayed: boolean): PersonDiscoveryResult { return Object.freeze({ kind: "accepted", run, replayed }); }
function blockedDiscovery(reason: Extract<PersonDiscoveryResult, { kind: "blocked" }>["reason"]): PersonDiscoveryResult { return Object.freeze({ kind: "blocked", reason }); }
function conflictDiscovery(reason: Extract<PersonDiscoveryResult, { kind: "conflict" }>["reason"]): PersonDiscoveryResult { return Object.freeze({ kind: "conflict", reason }); }
async function replayInFlight(promise: Promise<PersonDiscoveryResult>): Promise<PersonDiscoveryResult> { const result = await promise; return result.kind === "accepted" ? acceptedDiscovery(result.run, true) : result; }
function acceptedDecision(decision: DiscoveryDecisionRecord, replayed: boolean): PersonDiscoveryDecisionResult { return Object.freeze({ kind: "accepted", decision, replayed }); }
function blockedDecision(reason: Extract<PersonDiscoveryDecisionResult, { kind: "blocked" }>["reason"]): PersonDiscoveryDecisionResult { return Object.freeze({ kind: "blocked", reason }); }
function conflictDecision(reason: Extract<PersonDiscoveryDecisionResult, { kind: "conflict" }>["reason"]): PersonDiscoveryDecisionResult { return Object.freeze({ kind: "conflict", reason }); }
function acceptedIntent(intent: VerificationIntentRecord, replayed: boolean): VerificationIntentResult { return Object.freeze({ kind: "accepted", intent, replayed, providerCallAuthorized: false, contactEvidenceCreated: false }); }
function blockedIntent(reason: Extract<VerificationIntentResult, { kind: "blocked" }>["reason"]): VerificationIntentResult { return Object.freeze({ kind: "blocked", reason }); }
function conflictIntent(reason: Extract<VerificationIntentResult, { kind: "conflict" }>["reason"]): VerificationIntentResult { return Object.freeze({ kind: "conflict", reason }); }
