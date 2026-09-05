import { v7 as uuidv7 } from "uuid";

const REQUIRED_GMAIL_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
] as const);

export type OutreachRepositoryScope = Readonly<{
  workspaceId: string;
  ownerSubject: string;
  now?: () => number;
}>;

export type OutreachBinding = Readonly<{
  kind: "configuration" | "qualification" | "review_decision" | "source" | "evidence" | "claim_guardrail" | "contact_observation" | "contact_eligibility" | "package_version";
  id: string;
  digest: string;
}>;

export type OutreachPackageSnapshot = Readonly<{
  evidenceDigests: readonly string[];
  claimGuardrailDigests: readonly string[];
  recommendedAngle: string;
  selectedRole: "champion" | "economic_buyer" | "general";
  selectedContactPointDigests: readonly string[];
  callScript: string;
  draftMessageIds: readonly string[];
}>;

export type OutreachMessageSnapshot = Readonly<{
  senderReference: string;
  from: string;
  replyTo: string | null;
  to: readonly string[];
  cc: readonly string[];
  bcc: readonly string[];
  subject: string;
  textBody: string;
  htmlBody: string | null;
  links: readonly string[];
  attachments: readonly Readonly<{ id: string; name: string; mediaType: string; digest: string }>[];
  threadReference: string | null;
  replyToMessageReference: string | null;
}>;

export type CreatePackageVersionInput = Readonly<{
  packageId: string;
  prospectId: string;
  contactId: string;
  profileId: string;
  version: number;
  expectedVersion: number;
  configurationId: string;
  configurationDigest: string;
  configurationRevision: number;
  prospectRevision: number;
  contactRevision: number;
  contactEligibilitySnapshotId: string;
  snapshot: OutreachPackageSnapshot;
  bindings: readonly OutreachBinding[];
  idempotencyKey: string;
}>;

export type CreateMessageVersionInput = Readonly<{
  messageId: string;
  packageId: string;
  packageVersionId: string;
  version: number;
  expectedVersion: number;
  snapshot: OutreachMessageSnapshot;
  intendedSendAt: number | null;
  timezone: string;
  unsubscribeTokenDigest: string;
  bindings: readonly OutreachBinding[];
  idempotencyKey: string;
}>;

export type ApprovePackageInput = Readonly<{
  packageVersionId: string;
  expectedVersion: number;
  expiresAt: number;
  idempotencyKey: string;
}>;

export type ApproveMessageInput = Readonly<{
  messageVersionId: string;
  packageApprovalId: string;
  expectedVersion: number;
  acknowledgementDigest: string;
  expiresAt: number;
  idempotencyKey: string;
}>;

export type RecordSuppressionInput = Readonly<{
  subjectKind: "exact_email" | "confirmed_email_domain" | "e164_phone" | "contact" | "organization" | "company";
  subjectDigest: string;
  channel: "email" | "phone" | "all";
  reason: "owner_request" | "unsubscribe" | "explicit_opt_out" | "do_not_call" | "identity_retention" | "import_retention";
  sourceEventDigest: string;
  aliasDigests: readonly string[];
  effectiveAt: number;
  idempotencyKey: string;
}>;

export type RecordRecipientDispatchAuthorityInput = Readonly<{
  messageVersionId: string;
  packageApprovalId: string;
  emailObservationId: string;
  jurisdictionCode: string;
  claimedBasisCode: "consent" | "legitimate_interest" | "existing_relationship" | "other_documented";
  basisSourceId: string;
  basisSourceDigest: string;
  advisoryPolicyVersion: string;
  advisoryPolicyDigest: string;
  unsubscribePathDigest: string;
  acknowledgedAt: number;
  validUntil: number;
  idempotencyKey: string;
}>;

export type RecordUnsubscribeAuthorityEventInput = Readonly<{
  recipientAuthorityId: string;
  expectedRevision: number;
  status: "working" | "failed" | "revoked";
  checkDigest: string;
  observedAt: number;
  validUntil: number | null;
  idempotencyKey: string;
}>;

export type RecordSenderCapabilityInput = Readonly<{
  senderConnectionId: string;
  grantedScopes: readonly string[];
  verifiedAddresses: readonly Readonly<{ address: string; kind: "canonical" | "alias"; verificationDigest: string }>[];
  verifiedAt: number;
  expiresAt: number;
  idempotencyKey: string;
}>;

export type RevokeApprovalInput = Readonly<{
  targetKind: "package_approval" | "message_approval";
  targetApprovalId: string;
  reasonCode: "owner_revoked" | "dependency_changed" | "compliance_changed" | "sender_changed";
  sourceEventDigest: string;
  idempotencyKey: string;
}>;

export type OutreachWriteResult = Readonly<{
  id: string;
  digest: string;
  replayed: boolean;
}>;

export class OutreachRepositoryConflictError extends Error {
  constructor(reason = "conflict") {
    super(`outreach_repository_conflict:${reason}`);
    this.name = "OutreachRepositoryConflictError";
  }
}

const ID = /^[a-z0-9][a-z0-9_.:-]{2,127}$/iu;
const DIGEST = /^[a-f0-9]{64}$/u;
const TIMEZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+$/u;
const SECRET_KEY = /(?:password|secret|bearer|oauth|pkce|credential|authorization|cookie|access.?token|refresh.?token)/iu;
const MAX_SNAPSHOT_BYTES = 64 * 1024;

/**
 * Creates the uncomposed, provider-neutral D1 persistence seam. The scope must
 * be derived by trusted server admission; no method accepts workspace, owner,
 * provider response, credential, endpoint, or dispatch authority.
 */
export function createD1OutreachRepository(database: D1Database, scope: OutreachRepositoryScope) {
  if (!plainObject(scope) || !dataKeys(scope, ["workspaceId", "ownerSubject"], ["now"])) throw new TypeError("invalid_outreach_repository_scope");
  scope = Object.freeze({ workspaceId: scope.workspaceId, ownerSubject: scope.ownerSubject, ...(scope.now === undefined ? {} : { now: scope.now }) });
  if (!validId(scope.workspaceId) || !validId(scope.ownerSubject)) throw new TypeError("invalid_outreach_repository_scope");
  if (scope.now !== undefined && typeof scope.now !== "function") throw new TypeError("invalid_outreach_repository_clock");
  const clock = scope.now ?? Date.now;

  return Object.freeze({
    createPackageVersion: async (input: CreatePackageVersionInput): Promise<OutreachWriteResult> => {
      input = snapshotCommand(input, ["packageId", "prospectId", "contactId", "profileId", "version", "expectedVersion", "configurationId", "configurationDigest", "configurationRevision", "prospectRevision", "contactRevision", "contactEligibilitySnapshotId", "snapshot", "bindings", "idempotencyKey"]);
      validatePackageInput(input);
      await requireAdmission(database, scope);
      const now = positiveTime(clock());
      const snapshotJson = canonical(input.snapshot);
      boundedSnapshot(snapshotJson);
      const artifactDigest = await digest({
        schema: "outreach-package-version/v1", packageId: input.packageId, version: input.version,
        prospectId: input.prospectId, contactId: input.contactId, profileId: input.profileId,
        configurationId: input.configurationId, configurationDigest: input.configurationDigest,
        configurationRevision: input.configurationRevision, prospectRevision: input.prospectRevision,
        contactRevision: input.contactRevision, contactEligibilitySnapshotId: input.contactEligibilitySnapshotId,
        snapshot: input.snapshot, bindings: normalizedBindings(input.bindings),
      });
      const callScriptDigest = await digest({ schema: "outreach-call-script/v1", callScript: input.snapshot.callScript });
      const operationDigest = await digest({ schema: "outreach-command/v1", workspaceId: scope.workspaceId, commandKind: "package_version.create", artifactDigest });
      const versionId = derivedId("opv", operationDigest);
      const commandId = derivedId("ocm", operationDigest);
      const statements: D1PreparedStatement[] = [commandStatement(database, scope, {
        id: commandId, kind: "package_version.create", key: input.idempotencyKey, digest: operationDigest,
        expectedVersion: input.expectedVersion, resultKind: "package_version", resultId: versionId, now,
      })];
      if (input.version === 1) statements.push(database.prepare(
        `INSERT INTO outreach_packages (id,workspace_id,prospect_id,contact_id,profile_id,created_at)
         VALUES (?,?,?,?,?,?)`,
      ).bind(input.packageId, scope.workspaceId, input.prospectId, input.contactId, input.profileId, now));
      statements.push(database.prepare(
        `INSERT INTO outreach_package_versions (
          id,workspace_id,package_id,version,configuration_id,configuration_digest,configuration_revision,
          prospect_revision,contact_revision,contact_eligibility_snapshot_id,snapshot_json,artifact_digest,
          call_script_digest,command_id,created_at
        ) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
          WHERE EXISTS (SELECT 1 FROM outreach_packages parent WHERE parent.id=? AND parent.workspace_id=?
            AND parent.prospect_id=? AND parent.contact_id=? AND parent.profile_id=?)`,
      ).bind(
        versionId, scope.workspaceId, input.packageId, input.version, input.configurationId, input.configurationDigest,
        input.configurationRevision, input.prospectRevision, input.contactRevision, input.contactEligibilitySnapshotId,
        snapshotJson, artifactDigest, callScriptDigest, commandId, now,
        input.packageId, scope.workspaceId, input.prospectId, input.contactId, input.profileId,
      ));
      statements.push(...bindingStatements(database, scope.workspaceId, "package_version", versionId, input.bindings, now));
      statements.push(await auditStatement(database, scope, commandId, "package.version.created", "package_version", versionId, "version_created", operationDigest, now));
      return commit(database, scope.workspaceId, input.idempotencyKey, operationDigest, versionId, artifactDigest, statements);
    },

    createMessageVersion: async (input: CreateMessageVersionInput): Promise<OutreachWriteResult> => {
      input = snapshotCommand(input, ["messageId", "packageId", "packageVersionId", "version", "expectedVersion", "snapshot", "intendedSendAt", "timezone", "unsubscribeTokenDigest", "bindings", "idempotencyKey"]);
      validateMessageInput(input);
      await requireAdmission(database, scope);
      const now = positiveTime(clock());
      const snapshotJson = canonical(input.snapshot);
      boundedSnapshot(snapshotJson);
      const artifactDigest = await digest({
        schema: "outreach-message-version/v1", messageId: input.messageId, packageId: input.packageId,
        packageVersionId: input.packageVersionId, version: input.version, snapshot: input.snapshot,
        intendedSendAt: input.intendedSendAt, timezone: input.timezone,
        unsubscribeTokenDigest: input.unsubscribeTokenDigest, bindings: normalizedBindings(input.bindings),
      });
      const operationDigest = await digest({ schema: "outreach-command/v1", workspaceId: scope.workspaceId, commandKind: "message_version.create", artifactDigest });
      const versionId = derivedId("omv", operationDigest);
      const commandId = derivedId("ocm", operationDigest);
      const statements: D1PreparedStatement[] = [commandStatement(database, scope, {
        id: commandId, kind: "message_version.create", key: input.idempotencyKey, digest: operationDigest,
        expectedVersion: input.expectedVersion, resultKind: "message_version", resultId: versionId, now,
      })];
      if (input.version === 1) statements.push(database.prepare(
        "INSERT INTO outreach_messages (id,workspace_id,package_id,channel,created_at) VALUES (?,?,?,'email',?)",
      ).bind(input.messageId, scope.workspaceId, input.packageId, now));
      statements.push(database.prepare(
        `INSERT INTO outreach_message_versions (
          id,workspace_id,message_id,package_version_id,version,snapshot_json,artifact_digest,
          intended_send_at,timezone,unsubscribe_token_digest,command_id,created_at
        ) SELECT ?,?,?,?,?,?,?,?,?,?,?,?
          WHERE EXISTS (SELECT 1 FROM outreach_messages parent WHERE parent.id=? AND parent.workspace_id=? AND parent.package_id=?)`,
      ).bind(
        versionId, scope.workspaceId, input.messageId, input.packageVersionId, input.version, snapshotJson,
        artifactDigest, input.intendedSendAt, input.timezone, input.unsubscribeTokenDigest, commandId, now,
        input.messageId, scope.workspaceId, input.packageId,
      ));
      statements.push(...bindingStatements(database, scope.workspaceId, "message_version", versionId, input.bindings, now));
      statements.push(await auditStatement(database, scope, commandId, "message.version.created", "message_version", versionId, "version_created", operationDigest, now));
      return commit(database, scope.workspaceId, input.idempotencyKey, operationDigest, versionId, artifactDigest, statements);
    },

    recordRecipientDispatchAuthority: async (input: RecordRecipientDispatchAuthorityInput): Promise<OutreachWriteResult> => {
      input = snapshotCommand(input, ["messageVersionId", "packageApprovalId", "emailObservationId", "jurisdictionCode", "claimedBasisCode", "basisSourceId", "basisSourceDigest", "advisoryPolicyVersion", "advisoryPolicyDigest", "unsubscribePathDigest", "acknowledgedAt", "validUntil", "idempotencyKey"]);
      if (
        ![input.messageVersionId, input.packageApprovalId, input.emailObservationId, input.basisSourceId, input.idempotencyKey].every(validId)
        || ![input.basisSourceDigest, input.advisoryPolicyDigest, input.unsubscribePathDigest].every(validDigest)
        || !/^[A-Z0-9][A-Z0-9_.:-]{1,63}$/u.test(input.jurisdictionCode)
        || !["consent", "legitimate_interest", "existing_relationship", "other_documented"].includes(input.claimedBasisCode)
        || !boundedText(input.advisoryPolicyVersion, 1, 128)
      ) throw conflict("invalid_recipient_dispatch_authority");
      await requireAdmission(database, scope);
      const now = positiveTime(clock());
      if (!positive(input.acknowledgedAt) || input.acknowledgedAt > now || !futureTime(input.validUntil, now)) throw conflict("invalid_recipient_dispatch_authority_time");
      const row = await database.prepare(
        `SELECT mv.artifact_digest message_artifact_digest,mv.snapshot_json,mv.unsubscribe_token_digest,mv.created_at message_created_at,
                pv.id package_version_id,package.contact_id,pa.approval_digest package_approval_digest,pa.expires_at package_expires_at,
                observation.contact_point_digest,observation.observation_digest
         FROM outreach_message_versions mv
         JOIN outreach_package_versions pv ON pv.id=mv.package_version_id AND pv.workspace_id=mv.workspace_id
         JOIN outreach_packages package ON package.id=pv.package_id AND package.workspace_id=pv.workspace_id
         JOIN outreach_package_approvals pa ON pa.id=? AND pa.workspace_id=mv.workspace_id AND pa.package_version_id=pv.id
         JOIN contact_point_observations observation ON observation.id=? AND observation.workspace_id=mv.workspace_id AND observation.contact_id=package.contact_id
         WHERE mv.id=? AND mv.workspace_id=? LIMIT 1`,
      ).bind(input.packageApprovalId, input.emailObservationId, input.messageVersionId, scope.workspaceId).first<{
        message_artifact_digest: string; snapshot_json: string; unsubscribe_token_digest: string; message_created_at: number;
        package_version_id: string; contact_id: string; package_approval_digest: string; package_expires_at: number;
        contact_point_digest: string; observation_digest: string;
      }>();
      const messageSnapshot = row && parseMessageSnapshot(row.snapshot_json);
      if (
        !row || !messageSnapshot || messageSnapshot.to.length !== 1 || messageSnapshot.cc.length !== 0 || messageSnapshot.bcc.length !== 0
        || !validDigest(row.message_artifact_digest) || !validDigest(row.unsubscribe_token_digest)
        || !validDigest(row.package_approval_digest) || !validDigest(row.contact_point_digest)
        || input.validUntil > Number(row.package_expires_at) || input.acknowledgedAt < Number(row.message_created_at)
      ) throw conflict("recipient_dispatch_authority_unavailable");
      const recipient = normalizeMailbox(messageSnapshot.to[0]);
      const sender = normalizeMailbox(messageSnapshot.from);
      const recipientAddressDigest = await digest({ schema: "contact-point/v1", kind: "email", normalizedValue: recipient });
      if (recipientAddressDigest !== row.contact_point_digest) throw conflict("recipient_contact_point_mismatch");
      const senderAddressDigest = await digest({ schema: "outreach-sender-address/v1", address: sender });
      const authorityDigest = await digest({
        schema: "outreach-recipient-dispatch-authority/v1",
        workspaceId: scope.workspaceId,
        messageVersionId: input.messageVersionId,
        messageArtifactDigest: row.message_artifact_digest,
        packageApprovalId: input.packageApprovalId,
        packageApprovalDigest: row.package_approval_digest,
        contactId: row.contact_id,
        emailObservationId: input.emailObservationId,
        recipientAddressDigest,
        senderAddressDigest,
        jurisdictionCode: input.jurisdictionCode,
        claimedBasisCode: input.claimedBasisCode,
        basisSourceId: input.basisSourceId,
        basisSourceDigest: input.basisSourceDigest,
        advisoryPolicyVersion: input.advisoryPolicyVersion,
        advisoryPolicyDigest: input.advisoryPolicyDigest,
        unsubscribeTokenDigest: row.unsubscribe_token_digest,
        unsubscribePathDigest: input.unsubscribePathDigest,
        unsubscribeScopeKind: "exact_email",
        unsubscribeScopeDigest: recipientAddressDigest,
        ownerSubject: scope.ownerSubject,
        acknowledgedAt: input.acknowledgedAt,
        validUntil: input.validUntil,
      });
      const operationDigest = await digest({ schema: "outreach-command/v1", workspaceId: scope.workspaceId, commandKind: "recipient_dispatch_authority.record", authorityDigest });
      const authorityId = derivedId("orda", operationDigest);
      const commandId = derivedId("ocm", operationDigest);
      const statements = [
        commandStatement(database, scope, { id: commandId, kind: "recipient_dispatch_authority.record", key: input.idempotencyKey, digest: operationDigest, expectedVersion: 0, resultKind: "recipient_dispatch_authority", resultId: authorityId, now }),
        database.prepare(
          `INSERT INTO outreach_recipient_dispatch_authorities (
            id,workspace_id,message_version_id,message_artifact_digest,package_approval_id,package_approval_digest,
            contact_id,email_observation_id,recipient_address_digest,sender_address_digest,jurisdiction_code,claimed_basis_code,
            basis_source_id,basis_source_digest,advisory_policy_version,advisory_policy_digest,acknowledgement_digest,
            unsubscribe_token_digest,unsubscribe_path_digest,unsubscribe_scope_kind,unsubscribe_scope_digest,owner_subject,
            acknowledged_at,authority_digest,valid_until,command_id,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(
          authorityId, scope.workspaceId, input.messageVersionId, row.message_artifact_digest, input.packageApprovalId, row.package_approval_digest,
          row.contact_id, input.emailObservationId, recipientAddressDigest, senderAddressDigest, input.jurisdictionCode, input.claimedBasisCode,
          input.basisSourceId, input.basisSourceDigest, input.advisoryPolicyVersion, input.advisoryPolicyDigest, authorityDigest,
          row.unsubscribe_token_digest, input.unsubscribePathDigest, "exact_email", recipientAddressDigest, scope.ownerSubject,
          input.acknowledgedAt, authorityDigest, input.validUntil, commandId, now,
        ),
        await auditStatement(database, scope, commandId, "recipient_dispatch_authority.recorded", "recipient_dispatch_authority", authorityId, "owner_acknowledged_advisory", operationDigest, now),
      ];
      return commit(database, scope.workspaceId, input.idempotencyKey, operationDigest, authorityId, authorityDigest, statements);
    },

    recordUnsubscribeAuthorityEvent: async (input: RecordUnsubscribeAuthorityEventInput): Promise<OutreachWriteResult> => {
      input = snapshotCommand(input, ["recipientAuthorityId", "expectedRevision", "status", "checkDigest", "observedAt", "validUntil", "idempotencyKey"]);
      if (
        !validId(input.recipientAuthorityId) || !validId(input.idempotencyKey) || !validDigest(input.checkDigest)
        || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
        || !["working", "failed", "revoked"].includes(input.status)
      ) throw conflict("invalid_unsubscribe_authority_event");
      await requireAdmission(database, scope);
      const now = positiveTime(clock());
      if (!positive(input.observedAt) || input.observedAt > now) throw conflict("invalid_unsubscribe_authority_event_time");
      if ((input.status === "working") !== (input.validUntil !== null) || (input.validUntil !== null && !futureTime(input.validUntil, input.observedAt))) throw conflict("invalid_unsubscribe_authority_event_validity");
      const revision = input.expectedRevision + 1;
      const eventDigest = await digest({
        schema: "outreach-unsubscribe-authority-event/v1", workspaceId: scope.workspaceId,
        recipientAuthorityId: input.recipientAuthorityId, revision, status: input.status,
        checkDigest: input.checkDigest, observedAt: input.observedAt, validUntil: input.validUntil,
      });
      const operationDigest = await digest({ schema: "outreach-command/v1", workspaceId: scope.workspaceId, commandKind: "unsubscribe_authority_event.record", eventDigest });
      const eventId = derivedId("ouae", operationDigest);
      const commandId = derivedId("ocm", operationDigest);
      const statements = [
        commandStatement(database, scope, { id: commandId, kind: "unsubscribe_authority_event.record", key: input.idempotencyKey, digest: operationDigest, expectedVersion: input.expectedRevision, resultKind: "unsubscribe_authority_event", resultId: eventId, now }),
        database.prepare(
          `INSERT INTO outreach_unsubscribe_authority_events
            (id,workspace_id,recipient_authority_id,revision,status,check_digest,event_digest,observed_at,valid_until,command_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(eventId, scope.workspaceId, input.recipientAuthorityId, revision, input.status, input.checkDigest, eventDigest, input.observedAt, input.validUntil, commandId, now),
        await auditStatement(database, scope, commandId, "unsubscribe_authority_event.recorded", "unsubscribe_authority_event", eventId, input.status, operationDigest, now),
      ];
      return commit(database, scope.workspaceId, input.idempotencyKey, operationDigest, eventId, eventDigest, statements);
    },

    recordSenderCapability: async (input: RecordSenderCapabilityInput): Promise<OutreachWriteResult> => {
      input = snapshotCommand(input, ["senderConnectionId", "grantedScopes", "verifiedAddresses", "verifiedAt", "expiresAt", "idempotencyKey"]);
      if (!validId(input.senderConnectionId) || !validId(input.idempotencyKey) || !positive(input.verifiedAt) || !positive(input.expiresAt)) throw conflict("invalid_sender_capability");
      const grantedScopes = uniqueBoundedStrings(input.grantedScopes, 1, 16, 256);
      if (
        !grantedScopes
        || grantedScopes.length !== REQUIRED_GMAIL_SCOPES.length
        || grantedScopes.some((grantedScope, index) => grantedScope !== REQUIRED_GMAIL_SCOPES[index])
        || !Array.isArray(input.verifiedAddresses)
        || input.verifiedAddresses.length < 1
        || input.verifiedAddresses.length > 32
      ) throw conflict("invalid_sender_capability");
      const addresses = input.verifiedAddresses.map((address) => {
        if (!plainObject(address) || !exactKeys(address, ["address", "kind", "verificationDigest"]) || !["canonical", "alias"].includes(address.kind) || !validDigest(address.verificationDigest)) throw conflict("invalid_sender_address");
        return { address: normalizeMailbox(address.address), kind: address.kind, verificationDigest: address.verificationDigest };
      });
      if (new Set(addresses.map((address) => address.address)).size !== addresses.length) throw conflict("duplicate_sender_address");
      await requireAdmission(database, scope);
      const now = positiveTime(clock());
      if (input.verifiedAt > now || input.expiresAt <= now) throw conflict("invalid_sender_capability_time");
      const connection = await database.prepare(
        `SELECT connection_subject_digest,sender_address_digest FROM outreach_sender_connections
         WHERE id=? AND workspace_id=? AND status='active' LIMIT 1`,
      ).bind(input.senderConnectionId, scope.workspaceId).first<{ connection_subject_digest: string; sender_address_digest: string }>();
      if (!connection || !validDigest(connection.connection_subject_digest) || !validDigest(connection.sender_address_digest)) throw conflict("sender_connection_unavailable");
      const addressRows = (await Promise.all(addresses.map(async (address) => ({
        ...address,
        addressDigest: await digest({ schema: "outreach-sender-address/v1", address: address.address }),
      })))).sort((left, right) => `${left.kind}:${left.addressDigest}`.localeCompare(`${right.kind}:${right.addressDigest}`));
      if (!addressRows.some((address) => address.kind === "canonical" && address.addressDigest === connection.sender_address_digest)) throw conflict("canonical_sender_unverified");
      const verifiedAddresses = addressRows.map((address) => ({
        addressDigest: address.addressDigest,
        kind: address.kind,
        verificationDigest: address.verificationDigest,
      }));
      const scopeSetDigest = await digest({ schema: "outreach-sender-scopes/v1", grantedScopes });
      const capabilityDigest = await digest({
        schema: "outreach-sender-capability/v1", workspaceId: scope.workspaceId, senderConnectionId: input.senderConnectionId,
        connectionSubjectDigest: connection.connection_subject_digest, canonicalAddressDigest: connection.sender_address_digest,
        grantedScopes, scopeSetDigest, verifiedAddresses,
        verifiedAt: input.verifiedAt, expiresAt: input.expiresAt,
      });
      const operationDigest = await digest({ schema: "outreach-command/v1", workspaceId: scope.workspaceId, commandKind: "sender_capability.record", capabilityDigest });
      const capabilityId = derivedId("oscs", operationDigest);
      const commandId = derivedId("ocm", operationDigest);
      const statements: D1PreparedStatement[] = [
        commandStatement(database, scope, { id: commandId, kind: "sender_capability.record", key: input.idempotencyKey, digest: operationDigest, expectedVersion: 0, resultKind: "sender_capability_snapshot", resultId: capabilityId, now }),
        database.prepare(
          `INSERT INTO outreach_sender_capability_snapshots
            (id,workspace_id,sender_connection_id,connection_subject_digest,canonical_address_digest,granted_scopes_json,verified_addresses_json,scope_set_digest,capability_digest,verified_at,expires_at,command_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(capabilityId, scope.workspaceId, input.senderConnectionId, connection.connection_subject_digest, connection.sender_address_digest, canonical(grantedScopes), canonical(verifiedAddresses), scopeSetDigest, capabilityDigest, input.verifiedAt, input.expiresAt, commandId, now),
      ];
      for (const [ordinal, address] of addressRows.entries()) {
        statements.push(database.prepare(
          `INSERT INTO outreach_sender_verified_addresses
            (id,workspace_id,sender_capability_id,address_digest,address_kind,verification_digest,verified_at,expires_at,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        ).bind(derivedId("osva", `${ordinal}:${capabilityDigest}`), scope.workspaceId, capabilityId, address.addressDigest, address.kind, address.verificationDigest, input.verifiedAt, input.expiresAt, now));
      }
      statements.push(await auditStatement(database, scope, commandId, "sender_capability.recorded", "sender_capability_snapshot", capabilityId, "capability_verified", operationDigest, now));
      return commit(database, scope.workspaceId, input.idempotencyKey, operationDigest, capabilityId, capabilityDigest, statements);
    },

    revokeApproval: async (input: RevokeApprovalInput): Promise<OutreachWriteResult> => {
      input = snapshotCommand(input, ["targetKind", "targetApprovalId", "reasonCode", "sourceEventDigest", "idempotencyKey"]);
      if (
        !["package_approval", "message_approval"].includes(input.targetKind) || !validId(input.targetApprovalId)
        || !["owner_revoked", "dependency_changed", "compliance_changed", "sender_changed"].includes(input.reasonCode)
        || !validDigest(input.sourceEventDigest) || !validId(input.idempotencyKey)
      ) throw conflict("invalid_approval_revocation");
      await requireAdmission(database, scope);
      const replay = await database.prepare(
        `SELECT revocation.id,revocation.revocation_digest,revocation.package_approval_id,revocation.message_approval_id,
                revocation.reason_code,revocation.source_event_digest
         FROM outreach_commands command
         JOIN outreach_approval_revocations revocation ON revocation.command_id=command.id AND revocation.workspace_id=command.workspace_id
         WHERE command.workspace_id=? AND command.owner_subject=? AND command.idempotency_key=?
           AND command.command_kind='approval.revoke' LIMIT 1`,
      ).bind(scope.workspaceId, scope.ownerSubject, input.idempotencyKey).first<{
        id: string;
        revocation_digest: string;
        package_approval_id: string | null;
        message_approval_id: string | null;
        reason_code: string;
        source_event_digest: string;
      }>();
      if (replay) {
        const exactTarget = input.targetKind === "package_approval"
          ? replay.package_approval_id === input.targetApprovalId && replay.message_approval_id === null
          : replay.message_approval_id === input.targetApprovalId && replay.package_approval_id === null;
        if (
          !exactTarget
          || replay.reason_code !== input.reasonCode
          || replay.source_event_digest !== input.sourceEventDigest
          || !validId(replay.id)
          || !validDigest(replay.revocation_digest)
        ) throw conflict("idempotency_conflict");
        return Object.freeze({ id: replay.id, digest: replay.revocation_digest, replayed: true });
      }
      const now = positiveTime(clock());
      const table = input.targetKind === "package_approval" ? "outreach_package_approvals" : "outreach_message_approvals";
      const approval = await database.prepare(
        `SELECT approval_digest FROM ${table} WHERE id=? AND workspace_id=? AND owner_subject=? LIMIT 1`,
      ).bind(input.targetApprovalId, scope.workspaceId, scope.ownerSubject).first<{ approval_digest: string }>();
      if (!approval || !validDigest(approval.approval_digest)) throw conflict("approval_unavailable");
      const revocationDigest = await digest({
        schema: "outreach-approval-revocation/v1", workspaceId: scope.workspaceId, targetKind: input.targetKind,
        targetApprovalId: input.targetApprovalId, approvalDigest: approval.approval_digest,
        actorSubject: scope.ownerSubject, reasonCode: input.reasonCode, sourceEventDigest: input.sourceEventDigest, effectiveAt: now,
      });
      const operationDigest = await digest({ schema: "outreach-command/v1", workspaceId: scope.workspaceId, commandKind: "approval.revoke", revocationDigest });
      const revocationId = derivedId("oarv", operationDigest);
      const commandId = derivedId("ocm", operationDigest);
      const statements = [
        commandStatement(database, scope, { id: commandId, kind: "approval.revoke", key: input.idempotencyKey, digest: operationDigest, expectedVersion: 0, resultKind: "approval_revocation", resultId: revocationId, now }),
        database.prepare(
          `INSERT INTO outreach_approval_revocations
            (id,workspace_id,package_approval_id,message_approval_id,approval_digest,actor_subject,reason_code,source_event_digest,revocation_digest,effective_at,command_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(revocationId, scope.workspaceId, input.targetKind === "package_approval" ? input.targetApprovalId : null, input.targetKind === "message_approval" ? input.targetApprovalId : null, approval.approval_digest, scope.ownerSubject, input.reasonCode, input.sourceEventDigest, revocationDigest, now, commandId, now),
        await auditStatement(database, scope, commandId, "approval.revoked", "approval_revocation", revocationId, input.reasonCode, operationDigest, now),
      ];
      try {
        return await commit(database, scope.workspaceId, input.idempotencyKey, operationDigest, revocationId, revocationDigest, statements);
      } catch {
        const winner = await database.prepare(
          `SELECT revocation.id,revocation.revocation_digest,revocation.package_approval_id,revocation.message_approval_id,
                  revocation.reason_code,revocation.source_event_digest
           FROM outreach_commands command
           JOIN outreach_approval_revocations revocation ON revocation.command_id=command.id AND revocation.workspace_id=command.workspace_id
           WHERE command.workspace_id=? AND command.owner_subject=? AND command.idempotency_key=?
             AND command.command_kind='approval.revoke' LIMIT 1`,
        ).bind(scope.workspaceId, scope.ownerSubject, input.idempotencyKey).first<{
          id: string;
          revocation_digest: string;
          package_approval_id: string | null;
          message_approval_id: string | null;
          reason_code: string;
          source_event_digest: string;
        }>();
        const exactTarget = input.targetKind === "package_approval"
          ? winner?.package_approval_id === input.targetApprovalId && winner.message_approval_id === null
          : winner?.message_approval_id === input.targetApprovalId && winner.package_approval_id === null;
        if (
          winner
          && exactTarget
          && winner.reason_code === input.reasonCode
          && winner.source_event_digest === input.sourceEventDigest
          && validId(winner.id)
          && validDigest(winner.revocation_digest)
        ) return Object.freeze({ id: winner.id, digest: winner.revocation_digest, replayed: true });
        throw conflict("idempotency_conflict");
      }
    },

    approvePackageVersion: async (input: ApprovePackageInput): Promise<OutreachWriteResult> => {
      input = snapshotCommand(input, ["packageVersionId", "expectedVersion", "expiresAt", "idempotencyKey"]);
      if (!validId(input.packageVersionId) || !positive(input.expectedVersion) || !validId(input.idempotencyKey)) throw conflict();
      await requireAdmission(database, scope);
      const now = positiveTime(clock());
      if (!futureTime(input.expiresAt, now)) throw conflict();
      const version = await database.prepare(
        "SELECT artifact_digest,version FROM outreach_package_versions WHERE id=? AND workspace_id=? LIMIT 1",
      ).bind(input.packageVersionId, scope.workspaceId).first<{ artifact_digest: string; version: number }>();
      if (!version || Number(version.version) !== input.expectedVersion || !validDigest(version.artifact_digest)) throw conflict();
      const approvalDigest = await digest({ schema: "outreach-package-approval/v1", packageVersionId: input.packageVersionId, artifactDigest: version.artifact_digest, ownerSubject: scope.ownerSubject, expiresAt: input.expiresAt });
      const operationDigest = await digest({ schema: "outreach-command/v1", workspaceId: scope.workspaceId, commandKind: "package.approve", approvalDigest });
      const approvalId = derivedId("opa", operationDigest);
      const commandId = derivedId("ocm", operationDigest);
      const statements = [
        commandStatement(database, scope, { id: commandId, kind: "package.approve", key: input.idempotencyKey, digest: operationDigest, expectedVersion: input.expectedVersion, resultKind: "package_approval", resultId: approvalId, now }),
        database.prepare(
          `INSERT INTO outreach_package_approvals
            (id,workspace_id,package_version_id,artifact_digest,owner_subject,approval_digest,expires_at,command_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        ).bind(approvalId, scope.workspaceId, input.packageVersionId, version.artifact_digest, scope.ownerSubject, approvalDigest, input.expiresAt, commandId, now),
        await auditStatement(database, scope, commandId, "package.approved", "package_approval", approvalId, "owner_approved", operationDigest, now),
      ];
      return commit(database, scope.workspaceId, input.idempotencyKey, operationDigest, approvalId, approvalDigest, statements);
    },

    approveMessageVersion: async (input: ApproveMessageInput): Promise<OutreachWriteResult> => {
      input = snapshotCommand(input, ["messageVersionId", "packageApprovalId", "expectedVersion", "acknowledgementDigest", "expiresAt", "idempotencyKey"]);
      if (!validId(input.messageVersionId) || !validId(input.packageApprovalId) || !positive(input.expectedVersion) || !validDigest(input.acknowledgementDigest) || !validId(input.idempotencyKey)) throw conflict();
      await requireAdmission(database, scope);
      const now = positiveTime(clock());
      if (!futureTime(input.expiresAt, now)) throw conflict();
      const version = await database.prepare(
        "SELECT artifact_digest,version FROM outreach_message_versions WHERE id=? AND workspace_id=? LIMIT 1",
      ).bind(input.messageVersionId, scope.workspaceId).first<{ artifact_digest: string; version: number }>();
      if (!version || Number(version.version) !== input.expectedVersion || !validDigest(version.artifact_digest)) throw conflict();
      const approvalDigest = await digest({ schema: "outreach-message-approval/v1", messageVersionId: input.messageVersionId, packageApprovalId: input.packageApprovalId, artifactDigest: version.artifact_digest, acknowledgementDigest: input.acknowledgementDigest, ownerSubject: scope.ownerSubject, expiresAt: input.expiresAt });
      const operationDigest = await digest({ schema: "outreach-command/v1", workspaceId: scope.workspaceId, commandKind: "message.approve", approvalDigest });
      const approvalId = derivedId("oma", operationDigest);
      const commandId = derivedId("ocm", operationDigest);
      const statements = [
        commandStatement(database, scope, { id: commandId, kind: "message.approve", key: input.idempotencyKey, digest: operationDigest, expectedVersion: input.expectedVersion, resultKind: "message_approval", resultId: approvalId, now }),
        database.prepare(
          `INSERT INTO outreach_message_approvals (
            id,workspace_id,message_version_id,package_approval_id,artifact_digest,owner_subject,
            acknowledgement_digest,approval_digest,expires_at,command_id,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(approvalId, scope.workspaceId, input.messageVersionId, input.packageApprovalId, version.artifact_digest, scope.ownerSubject, input.acknowledgementDigest, approvalDigest, input.expiresAt, commandId, now),
        await auditStatement(database, scope, commandId, "message.approved", "message_approval", approvalId, "owner_acknowledged", operationDigest, now),
      ];
      return commit(database, scope.workspaceId, input.idempotencyKey, operationDigest, approvalId, approvalDigest, statements);
    },

    recordSuppression: async (input: RecordSuppressionInput): Promise<OutreachWriteResult> => {
      input = snapshotCommand(input, ["subjectKind", "subjectDigest", "channel", "reason", "sourceEventDigest", "aliasDigests", "effectiveAt", "idempotencyKey"]);
      validateSuppression(input);
      await requireAdmission(database, scope);
      const now = positiveTime(clock());
      if (!positive(input.effectiveAt) || input.effectiveAt > now) throw conflict();
      const aliasDigests = uniqueSorted(input.aliasDigests);
      const aliasSnapshotJson = canonical(aliasDigests);
      const aliasSnapshotDigest = await digest({ schema: "outreach-suppression-aliases/v1", aliasDigests });
      const tombstoneDigest = await digest({ schema: "outreach-suppression-tombstone/v1", subjectKind: input.subjectKind, subjectDigest: input.subjectDigest, channel: input.channel, reason: input.reason, sourceEventDigest: input.sourceEventDigest, aliasSnapshotDigest, effectiveAt: input.effectiveAt });
      const operationDigest = await digest({ schema: "outreach-command/v1", workspaceId: scope.workspaceId, commandKind: "suppression.record", tombstoneDigest });
      const tombstoneId = derivedId("ost", operationDigest);
      const stopId = derivedId("ose", operationDigest);
      const commandId = derivedId("ocm", operationDigest);
      const statements = [
        commandStatement(database, scope, { id: commandId, kind: "suppression.record", key: input.idempotencyKey, digest: operationDigest, expectedVersion: 0, resultKind: "suppression_tombstone", resultId: tombstoneId, now }),
        database.prepare(
          `INSERT INTO outreach_suppression_tombstones (
            id,workspace_id,subject_kind,subject_digest,channel,reason,source_event_digest,
            alias_snapshot_json,alias_snapshot_digest,tombstone_digest,actor_subject,effective_at,command_id,created_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).bind(tombstoneId, scope.workspaceId, input.subjectKind, input.subjectDigest, input.channel, input.reason, input.sourceEventDigest, aliasSnapshotJson, aliasSnapshotDigest, tombstoneDigest, scope.ownerSubject, input.effectiveAt, commandId, now),
        database.prepare(
          `INSERT INTO outreach_stop_events (
            id,workspace_id,stop_kind,tombstone_id,subject_kind,subject_digest,source_event_digest,
            reason_code,command_id,effective_at,created_at
          ) VALUES (?,?,'suppression',?,?,?,?,?,?,?,?)`,
        ).bind(stopId, scope.workspaceId, tombstoneId, input.subjectKind, input.subjectDigest, input.sourceEventDigest, input.reason, commandId, input.effectiveAt, now),
        await auditStatement(database, scope, commandId, "suppression.recorded", "suppression_tombstone", tombstoneId, input.reason, operationDigest, now),
      ];
      return commit(database, scope.workspaceId, input.idempotencyKey, operationDigest, tombstoneId, tombstoneDigest, statements);
    },

    isSuppressed: async (subjects: readonly Readonly<{ kind: RecordSuppressionInput["subjectKind"]; digest: string; channel: RecordSuppressionInput["channel"] }>[]): Promise<boolean> => {
      subjects = snapshotData(subjects);
      if (!Array.isArray(subjects) || subjects.length < 1 || subjects.length > 32 || subjects.some((subject) => !plainObject(subject) || !exactKeys(subject, ["kind", "digest", "channel"]) || !validDigest(subject.digest) || !validSubjectChannel(subject.kind, subject.channel))) throw conflict();
      await requireAdmission(database, scope);
      // One read gives every subject/alias the same database snapshot. Traverse
      // the complete same-kind alias component, including overlapping tombstones.
      const row = await database.prepare(`
        WITH RECURSIVE reach(kind,digest,channel) AS (
          SELECT json_extract(value,'$.kind'),json_extract(value,'$.digest'),json_extract(value,'$.channel') FROM json_each(?)
          UNION
          SELECT reach.kind, aliases.value, reach.channel FROM reach
          JOIN outreach_suppression_tombstones s ON s.workspace_id=? AND s.subject_kind=reach.kind
            AND (s.channel=reach.channel OR s.channel='all' OR reach.channel='all')
            AND (s.subject_digest=reach.digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=reach.digest))
          JOIN json_each(json_insert(s.alias_snapshot_json,'$[#]',s.subject_digest)) aliases
        ) SELECT 1 blocked FROM reach JOIN outreach_suppression_tombstones s
          ON s.workspace_id=? AND s.subject_kind=reach.kind
          AND (s.channel=reach.channel OR s.channel='all' OR reach.channel='all')
          AND (s.subject_digest=reach.digest OR EXISTS (SELECT 1 FROM json_each(s.alias_snapshot_json) a WHERE a.value=reach.digest)) LIMIT 1
      `).bind(canonical(subjects), scope.workspaceId, scope.workspaceId).first();
      return row !== null;
    },
  });
}

type Command = Readonly<{ id: string; kind: string; key: string; digest: string; expectedVersion: number; resultKind: string; resultId: string; now: number }>;

function commandStatement(database: D1Database, scope: OutreachRepositoryScope, command: Command) {
  return database.prepare(
    `INSERT INTO outreach_commands
      (id,workspace_id,owner_subject,command_kind,idempotency_key,operation_digest,expected_version,result_kind,result_id,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).bind(command.id, scope.workspaceId, scope.ownerSubject, command.kind, command.key, command.digest, command.expectedVersion, command.resultKind, command.resultId, command.now);
}

async function auditStatement(database: D1Database, scope: OutreachRepositoryScope, commandId: string, action: string, subjectKind: string, subjectId: string, reasonCode: string, operationDigest: string, now: number) {
  const materialDigest = await digest({ schema: "outreach-audit-record/v1", action, subjectKind, subjectId, reasonCode, operationDigest });
  return database.prepare(
    `INSERT INTO outreach_audit_records
      (id,workspace_id,actor_subject,action,subject_kind,subject_id,outcome,reason_code,material_digest,command_id,created_at)
     VALUES (?,?,?,?,?,?,'recorded',?,?,?,?)`,
  ).bind(derivedId("oar", materialDigest), scope.workspaceId, scope.ownerSubject, action, subjectKind, subjectId, reasonCode, materialDigest, commandId, now);
}

function bindingStatements(database: D1Database, workspaceId: string, artifactKind: "package_version" | "message_version", artifactId: string, bindings: readonly OutreachBinding[], now: number) {
  return normalizedBindings(bindings).map((binding, ordinal) => database.prepare(
    `INSERT INTO outreach_artifact_bindings
      (id,workspace_id,artifact_kind,artifact_id,binding_kind,binding_id,binding_digest,ordinal,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).bind(derivedId("oab", `${ordinal}:${artifactId}`), workspaceId, artifactKind, artifactId, binding.kind, binding.id, binding.digest, ordinal, now));
}

async function commit(database: D1Database, workspaceId: string, key: string, operationDigest: string, resultId: string, resultDigest: string, statements: readonly D1PreparedStatement[]): Promise<OutreachWriteResult> {
  try {
    await database.batch([...statements]);
    return Object.freeze({ id: resultId, digest: resultDigest, replayed: false });
  } catch (error) {
    const winner = await database.prepare(
      "SELECT operation_digest,result_id FROM outreach_commands WHERE workspace_id=? AND idempotency_key=? LIMIT 1",
    ).bind(workspaceId, key).first<{ operation_digest: string; result_id: string }>();
    if (winner?.operation_digest === operationDigest && winner.result_id === resultId) {
      return Object.freeze({ id: resultId, digest: resultDigest, replayed: true });
    }
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" && error.message.includes("unresolved outreach suppression scope")) throw conflict("unresolved_suppression_scope");
    throw conflict();
  }
}

async function requireAdmission(database: D1Database, scope: OutreachRepositoryScope) {
  const row = await database.prepare(
    "SELECT id FROM workspaces WHERE id=? AND owner_subject=? LIMIT 1",
  ).bind(scope.workspaceId, scope.ownerSubject).first();
  if (!row) throw conflict();
}

function validatePackageInput(input: CreatePackageVersionInput) {
  if (![input.packageId, input.prospectId, input.contactId, input.profileId, input.configurationId, input.contactEligibilitySnapshotId, input.idempotencyKey].every(validId)) throw conflict("invalid_package_identifier");
  if (!validDigest(input.configurationDigest)) throw conflict("invalid_package_configuration_digest");
  if (!positive(input.version) || input.expectedVersion !== input.version - 1 || !positive(input.configurationRevision) || !positive(input.prospectRevision) || !positive(input.contactRevision)) throw conflict("invalid_package_revision");
  if (!validPackageSnapshot(input.snapshot)) throw conflict("invalid_package_snapshot");
  if (!validBindings(input.bindings, true)) throw conflict("invalid_package_bindings");
}

function validateMessageInput(input: CreateMessageVersionInput) {
  if (![input.messageId, input.packageId, input.packageVersionId, input.idempotencyKey].every(validId)) throw conflict();
  if (!positive(input.version) || input.expectedVersion !== input.version - 1 || !validDigest(input.unsubscribeTokenDigest) || !TIMEZONE.test(input.timezone) || !validMessageSnapshot(input.snapshot) || !validBindings(input.bindings, false)) throw conflict();
  if (input.intendedSendAt !== null && !positive(input.intendedSendAt)) throw conflict();
}

function validateSuppression(input: RecordSuppressionInput) {
  const subjectKinds = ["exact_email", "confirmed_email_domain", "e164_phone", "contact", "organization", "company"];
  const channels = ["email", "phone", "all"];
  const reasons = ["owner_request", "unsubscribe", "explicit_opt_out", "do_not_call", "identity_retention", "import_retention"];
  if (!subjectKinds.includes(input.subjectKind) || !channels.includes(input.channel) || !validSubjectChannel(input.subjectKind, input.channel) || !reasons.includes(input.reason) || !validDigest(input.subjectDigest) || !validDigest(input.sourceEventDigest) || !validId(input.idempotencyKey)) throw conflict();
  if (input.aliasDigests.length > 64 || input.aliasDigests.some((item) => !validDigest(item))) throw conflict();
}

function parseMessageSnapshot(value: string): OutreachMessageSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return validMessageSnapshot(parsed as OutreachMessageSnapshot) ? parsed as OutreachMessageSnapshot : null;
  } catch {
    return null;
  }
}

function normalizeMailbox(value: unknown): string {
  if (typeof value !== "string") throw conflict("invalid_mailbox");
  const normalized = value.trim().toLowerCase();
  if (normalized !== value || normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) throw conflict("invalid_mailbox");
  return normalized;
}

function uniqueBoundedStrings(value: unknown, min: number, max: number, maxLength: number): string[] | null {
  if (!Array.isArray(value) || value.length < min || value.length > max || value.some((item) => !boundedText(item, 1, maxLength))) return null;
  const normalized = [...new Set(value)].sort();
  return normalized.length === value.length ? normalized : null;
}

function validPackageSnapshot(snapshot: OutreachPackageSnapshot) {
  return plainObject(snapshot) && validDigestList(snapshot.evidenceDigests, 1, 64) && validDigestList(snapshot.claimGuardrailDigests, 1, 32)
    && boundedText(snapshot.recommendedAngle, 1, 4_000) && ["champion", "economic_buyer", "general"].includes(snapshot.selectedRole)
    && validDigestList(snapshot.selectedContactPointDigests, 1, 8) && boundedText(snapshot.callScript, 1, 16_000)
    && validIdList(snapshot.draftMessageIds, 0, 32) && exactKeys(snapshot, ["evidenceDigests", "claimGuardrailDigests", "recommendedAngle", "selectedRole", "selectedContactPointDigests", "callScript", "draftMessageIds"]);
}

function validMessageSnapshot(snapshot: OutreachMessageSnapshot) {
  if (!plainObject(snapshot) || !exactKeys(snapshot, ["senderReference", "from", "replyTo", "to", "cc", "bcc", "subject", "textBody", "htmlBody", "links", "attachments", "threadReference", "replyToMessageReference"])) return false;
  if (!boundedText(snapshot.senderReference, 1, 256) || !boundedText(snapshot.from, 3, 320) || (snapshot.replyTo !== null && !boundedText(snapshot.replyTo, 3, 320))) return false;
  if (![snapshot.to, snapshot.cc, snapshot.bcc].every((list) => Array.isArray(list) && list.length <= 32 && list.every((item) => boundedText(item, 3, 320))) || snapshot.to.length < 1) return false;
  if (!boundedText(snapshot.subject, 1, 998) || !boundedText(snapshot.textBody, 1, 32_000) || (snapshot.htmlBody !== null && !boundedText(snapshot.htmlBody, 1, 48_000))) return false;
  if (!Array.isArray(snapshot.links) || snapshot.links.length > 64 || snapshot.links.some((item) => !boundedText(item, 1, 2_048))) return false;
  if (!Array.isArray(snapshot.attachments) || snapshot.attachments.length > 16 || snapshot.attachments.some((item) => !plainObject(item) || !exactKeys(item, ["id", "name", "mediaType", "digest"]) || !validId(item.id) || !boundedText(item.name, 1, 255) || !boundedText(item.mediaType, 1, 127) || !validDigest(item.digest))) return false;
  return [snapshot.threadReference, snapshot.replyToMessageReference].every((item) => item === null || boundedText(item, 1, 512));
}

function validBindings(bindings: readonly OutreachBinding[], packageBindings: boolean) {
  if (!Array.isArray(bindings) || bindings.length < 1 || bindings.length > 128) return false;
  if (bindings.some((binding) => !plainObject(binding) || !exactKeys(binding, ["kind", "id", "digest"]) || !validId(binding.id) || !validDigest(binding.digest))) return false;
  const identities = new Set(bindings.map((binding) => `${binding.kind}:${binding.id}`));
  if (identities.size !== bindings.length) return false;
  const kinds = new Set(bindings.map((binding) => binding.kind));
  return packageBindings
    ? ["configuration", "qualification", "review_decision", "source", "evidence", "claim_guardrail", "contact_eligibility"].every((kind) => kinds.has(kind as OutreachBinding["kind"]))
    : bindings.length === 1 && kinds.has("package_version");
}

function normalizedBindings(bindings: readonly OutreachBinding[]) {
  return [...bindings].map((binding) => ({ kind: binding.kind, id: binding.id, digest: binding.digest })).sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
}

function validSubjectChannel(kind: unknown, channel: unknown) {
  return ["exact_email", "confirmed_email_domain", "e164_phone", "contact", "organization", "company"].includes(String(kind))
    && ["email", "phone", "all"].includes(String(channel))
    && (!(kind === "exact_email" || kind === "confirmed_email_domain") || channel === "email" || channel === "all")
    && (kind !== "e164_phone" || channel === "phone" || channel === "all");
}

function dataKeys(value: object, required: readonly string[], optional: readonly string[] = []) {
  const keys = Reflect.ownKeys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => typeof key === "string" && [...required, ...optional].includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, "value"));
}

/** Capture before any admission/hash await; never invoke accessors or toJSON. */
function snapshotData<T>(value: T): T {
  let nodes = 0;
  const seen = new Set<object>();
  const copy = (item: unknown, depth: number): unknown => {
    if (++nodes > 4096 || depth > 12) throw conflict("invalid_input_shape");
    if (item === null || typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isSafeInteger(item))) return item;
    if (!item || typeof item !== "object" || seen.has(item)) throw conflict("invalid_input_shape");
    seen.add(item);
    try {
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype || item.length > 1024 || !dataKeys(item, ["length", ...Array.from({ length: item.length }, (_, index) => String(index))])) throw conflict("invalid_input_shape");
        return Object.freeze(Array.from({ length: item.length }, (_, index) => copy(Object.getOwnPropertyDescriptor(item, String(index))!.value, depth + 1)));
      }
      if (!plainObject(item)) throw conflict("invalid_input_shape");
      const keys = Reflect.ownKeys(item);
      if (keys.some((key) => typeof key !== "string" || !Object.hasOwn(Object.getOwnPropertyDescriptor(item, key) ?? {}, "value"))) throw conflict("invalid_input_shape");
      return Object.freeze(Object.fromEntries(keys.map((key) => [key, copy(Object.getOwnPropertyDescriptor(item, key)!.value, depth + 1)])));
    } finally { seen.delete(item); }
  };
  return copy(value, 0) as T;
}

function snapshotCommand<T>(value: T, keys: readonly string[]): T {
  const copied = snapshotData(value);
  if (!plainObject(copied) || !exactKeys(copied, keys)) throw conflict("invalid_command_shape");
  return copied;
}

function canonical(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (plainObject(value)) {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).some((key) => SECRET_KEY.test(key))) throw conflict();
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, canonicalValue(object[key])]));
  }
  throw conflict();
}

async function digest(value: unknown) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonical(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function derivedId(prefix: string, material: string) {
  if (DIGEST.test(material)) return `${prefix}_${material.slice(0, 32)}`;
  const compact = Array.from(new TextEncoder().encode(material), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${compact.slice(0, 32).padEnd(32, "0")}_${uuidv7().slice(0, 8)}`;
}

function boundedSnapshot(value: string) {
  if (new TextEncoder().encode(value).byteLength > MAX_SNAPSHOT_BYTES) throw conflict();
}

function validId(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function validDigest(value: unknown): value is string { return typeof value === "string" && DIGEST.test(value); }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function positiveTime(value: unknown) { if (!positive(value)) throw conflict(); return Number(value); }
function futureTime(value: unknown, now: number) { return positive(value) && Number(value) > now; }
function boundedText(value: unknown, min: number, max: number): value is string { return typeof value === "string" && value.length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value); }
function plainObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function exactKeys(value: object, keys: readonly string[]) { return Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000"); }
function validDigestList(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every(validDigest) && new Set(value).size === value.length; }
function validIdList(value: unknown, min: number, max: number): value is readonly string[] { return Array.isArray(value) && value.length >= min && value.length <= max && value.every(validId) && new Set(value).size === value.length; }
function uniqueSorted(values: readonly string[]) { return [...new Set(values)].sort(); }
function conflict(reason?: string) { return new OutreachRepositoryConflictError(reason); }
