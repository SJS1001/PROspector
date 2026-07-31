import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const auditColumns = {
  workspaceId: text("workspace_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  revision: integer("revision").notNull().default(1),
};

export const workspaces = sqliteTable("workspaces", { id: text("id").primaryKey(), companyName: text("company_name").notNull(), ownerSubject: text("owner_subject").notNull().unique(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(), revision: integer("revision").notNull().default(1) });
export const companies = sqliteTable("companies", { id: text("id").primaryKey(), ...auditColumns, name: text("name").notNull(), status: text("status", { enum: ["draft", "active", "archived"] }).notNull().default("draft") }, (t) => [uniqueIndex("companies_workspace_unique").on(t.workspaceId)]);
export const workspaceCompanies = sqliteTable("workspace_companies", { workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id), companyId: text("company_id").notNull().references(() => companies.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("workspace_companies_company_unique").on(t.companyId)]);

export const products = sqliteTable("products", { id: text("id").primaryKey(), ...auditColumns, companyId: text("company_id"), name: text("name").notNull(), lifecycle: text("lifecycle", { enum: ["draft", "ready", "paused", "archived"] }).notNull() }, (t) => [index("products_workspace_idx").on(t.workspaceId), index("products_company_idx").on(t.workspaceId, t.companyId)]);
export const marketPlays = sqliteTable("market_plays", { id: text("id").primaryKey(), ...auditColumns, productId: text("product_id").notNull().references(() => products.id), name: text("name").notNull(), lifecycle: text("lifecycle", { enum: ["draft", "active", "paused", "archived"] }).notNull() }, (t) => [index("plays_product_idx").on(t.workspaceId, t.productId)]);
export const profiles = sqliteTable("customer_profiles", { id: text("id").primaryKey(), ...auditColumns, playId: text("play_id").notNull().references(() => marketPlays.id), name: text("name").notNull(), lifecycle: text("lifecycle", { enum: ["draft", "ready", "paused", "archived"] }).notNull(), timezone: text("timezone").notNull(), weeklyTarget: integer("weekly_target").notNull().default(0) }, (t) => [index("profiles_play_idx").on(t.workspaceId, t.playId)]);
export const offers = sqliteTable("offers", { id: text("id").primaryKey(), ...auditColumns, profileId: text("profile_id").notNull().references(() => profiles.id), name: text("name").notNull(), valueJson: text("value_json").notNull(), questionId: text("question_id").notNull(), answerId: text("answer_id").notNull(), proposalId: text("proposal_id").notNull(), decisionId: text("decision_id").notNull(), knowledgeVersionId: text("knowledge_version_id").notNull(), authorityCommandId: text("authority_command_id").notNull(), auditEventId: text("audit_event_id").notNull() }, (t) => [index("offers_profile_idx").on(t.workspaceId, t.profileId), uniqueIndex("offers_authority_unique").on(t.authorityCommandId)]);

export const organizations = sqliteTable("organizations", { id: text("id").primaryKey(), ...auditColumns, companyId: text("company_id").notNull().references(() => companies.id), canonicalName: text("canonical_name").notNull(), identityDigest: text("identity_digest").notNull() }, (t) => [uniqueIndex("organization_company_identity_unique").on(t.workspaceId, t.companyId, t.identityDigest)]);
export const contacts = sqliteTable("contacts", { id: text("id").primaryKey(), ...auditColumns, companyId: text("company_id").notNull().references(() => companies.id), identityDigest: text("identity_digest").notNull(), displayName: text("display_name").notNull() }, (t) => [uniqueIndex("contact_company_identity_unique").on(t.workspaceId, t.companyId, t.identityDigest)]);
export const accounts = sqliteTable("accounts", { id: text("id").primaryKey(), ...auditColumns, playId: text("play_id").notNull().references(() => marketPlays.id), organizationId: text("organization_id").notNull().references(() => organizations.id), state: text("state", { enum: ["draft", "inactive", "archived"] }).notNull().default("draft") }, (t) => [uniqueIndex("account_play_organization_unique").on(t.workspaceId, t.playId, t.organizationId)]);
export const targets = sqliteTable("targets", { id: text("id").primaryKey(), ...auditColumns, profileId: text("profile_id").notNull().references(() => profiles.id), accountId: text("account_id").notNull().references(() => accounts.id), state: text("state", { enum: ["draft", "inactive", "archived"] }).notNull().default("draft") }, (t) => [uniqueIndex("target_profile_account_unique").on(t.workspaceId, t.profileId, t.accountId)]);
export const contactRelevance = sqliteTable("contact_relevance", { id: text("id").primaryKey(), ...auditColumns, playId: text("play_id").notNull().references(() => marketPlays.id), contactId: text("contact_id").notNull().references(() => contacts.id), relevanceJson: text("relevance_json").notNull() }, (t) => [uniqueIndex("contact_relevance_play_contact_unique").on(t.workspaceId, t.playId, t.contactId)]);

export const sources = sqliteTable("sources", { id: text("id").primaryKey(), ...auditColumns, origin: text("origin", { enum: ["public_research", "authorized_repository", "owner_import", "uploaded_quarantine", "reuse_package"] }).notNull(), opaqueLocator: text("opaque_locator").notNull(), sourceDigest: text("source_digest").notNull(), privacy: text("privacy", { enum: ["public", "private", "restricted"] }).notNull(), license: text("license").notNull(), status: text("status", { enum: ["available", "quarantined", "rejected"] }).notNull() }, (t) => [uniqueIndex("source_workspace_digest_unique").on(t.workspaceId, t.sourceDigest), uniqueIndex("source_workspace_locator_unique").on(t.workspaceId, t.opaqueLocator)]);
export const sourceExcerpts = sqliteTable("source_excerpts", { id: text("id").primaryKey(), ...auditColumns, sourceId: text("source_id").notNull().references(() => sources.id), excerptDigest: text("excerpt_digest").notNull(), content: text("content").notNull(), locator: text("locator").notNull() }, (t) => [uniqueIndex("source_excerpt_digest_unique").on(t.workspaceId, t.sourceId, t.excerptDigest)]);
export const sourceCustody = sqliteTable("source_custody", { id: text("id").primaryKey(), ...auditColumns, sourceId: text("source_id").notNull().references(() => sources.id), objectReference: text("object_reference").notNull(), quarantineStatus: text("quarantine_status", { enum: ["quarantined", "scan_pending", "scan_failed"] }).notNull(), scanStatus: text("scan_status", { enum: ["not_scanned", "pending", "failed"] }).notNull(), objectDigest: text("object_digest").notNull() }, (t) => [uniqueIndex("source_custody_object_unique").on(t.workspaceId, t.objectReference)]);
export const researchCandidates = sqliteTable("research_candidates", { id: text("id").primaryKey(), ...auditColumns, sourceId: text("source_id").notNull().references(() => sources.id), excerptId: text("excerpt_id").notNull().references(() => sourceExcerpts.id), opaqueLocator: text("opaque_locator").notNull(), provenanceDigest: text("provenance_digest").notNull(), visibility: text("visibility", { enum: ["public", "authorized"] }).notNull(), status: text("status", { enum: ["available", "withdrawn"] }).notNull() }, (t) => [uniqueIndex("research_candidate_locator_unique").on(t.workspaceId, t.opaqueLocator)]);

export const knowledgeItems = sqliteTable("knowledge_items", { id: text("id").primaryKey(), ...auditColumns, companyId: text("company_id").notNull().references(() => companies.id), scopeType: text("scope_type", { enum: ["company", "product", "play", "profile", "offer"] }).notNull(), scopeId: text("scope_id").notNull(), kind: text("kind").notNull(), slot: text("slot").notNull().default("default"), currentVersionId: text("current_version_id") }, (t) => [uniqueIndex("knowledge_item_scope_unique").on(t.workspaceId, t.scopeType, t.scopeId, t.kind, t.slot), uniqueIndex("knowledge_item_current_version_unique").on(t.currentVersionId)]);
export const knowledgeVersions = sqliteTable("knowledge_versions", { id: text("id").primaryKey(), ...auditColumns, knowledgeItemId: text("knowledge_item_id").references(() => knowledgeItems.id), proposalId: text("proposal_id"), decisionId: text("decision_id"), authorityCommandId: text("authority_command_id"), predecessorVersionId: text("predecessor_version_id"), scopeType: text("scope_type", { enum: ["company", "product", "play", "profile", "offer"] }).notNull(), scopeId: text("scope_id").notNull(), kind: text("kind").notNull(), valueJson: text("value_json").notNull(), valueDigest: text("value_digest"), status: text("status", { enum: ["proposed", "confirmed", "rejected", "superseded"] }).notNull(), sourceDigest: text("source_digest") }, (t) => [index("knowledge_scope_idx").on(t.workspaceId, t.scopeType, t.scopeId), index("knowledge_version_item_idx").on(t.knowledgeItemId, t.createdAt)]);
export const knowledgeProposals = sqliteTable("knowledge_proposals", { id: text("id").primaryKey(), ...auditColumns, companyId: text("company_id").notNull().references(() => companies.id), sourceId: text("source_id").references(() => sources.id), excerptId: text("excerpt_id").references(() => sourceExcerpts.id), destinationScopeType: text("destination_scope_type").notNull(), destinationScopeId: text("destination_scope_id").notNull(), kind: text("kind").notNull(), valueJson: text("value_json").notNull(), provenanceJson: text("provenance_json").notNull(), proposalDigest: text("proposal_digest").notNull(), origin: text("origin", { enum: ["research", "import", "upload", "owner_edit", "reuse"] }).notNull(), status: text("status", { enum: ["proposed", "reviewed", "rejected", "superseded"] }).notNull().default("proposed") }, (t) => [uniqueIndex("knowledge_proposal_digest_unique").on(t.workspaceId, t.proposalDigest)]);
export const authorityCommands = sqliteTable("authority_commands", { id: text("id").primaryKey(), ...auditColumns, commandType: text("command_type").notNull(), idempotencyKey: text("idempotency_key").notNull(), operationDigest: text("operation_digest").notNull(), expectedRevision: integer("expected_revision").notNull(), subjectType: text("subject_type").notNull(), subjectId: text("subject_id").notNull(), status: text("status", { enum: ["accepted", "superseded"] }).notNull().default("accepted") }, (t) => [uniqueIndex("authority_command_key_unique").on(t.workspaceId, t.idempotencyKey), uniqueIndex("authority_command_digest_unique").on(t.workspaceId, t.operationDigest)]);
export const proposalDecisions = sqliteTable("proposal_decisions", { id: text("id").primaryKey(), ...auditColumns, proposalId: text("proposal_id").notNull().references(() => knowledgeProposals.id), answerId: text("answer_id").references(() => interviewAnswers.id), authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id), decision: text("decision", { enum: ["accept", "reject", "correct", "rescope"] }).notNull(), reviewedSnapshotDigest: text("reviewed_snapshot_digest").notNull(), operationDigest: text("operation_digest").notNull(), idempotencyKey: text("idempotency_key").notNull() }, (t) => [uniqueIndex("proposal_decision_proposal_unique").on(t.proposalId), uniqueIndex("proposal_decision_key_unique").on(t.workspaceId, t.idempotencyKey), uniqueIndex("proposal_decision_snapshot_unique").on(t.workspaceId, t.reviewedSnapshotDigest)]);
export const proposalPrerequisites = sqliteTable("proposal_prerequisites", { proposalId: text("proposal_id").notNull().references(() => knowledgeProposals.id), knowledgeVersionId: text("knowledge_version_id").notNull().references(() => knowledgeVersions.id), prerequisiteDigest: text("prerequisite_digest").notNull() }, (t) => [uniqueIndex("proposal_prerequisite_unique").on(t.proposalId, t.knowledgeVersionId)]);

export const interviewSessions = sqliteTable("interview_sessions", { id: text("id").primaryKey(), ...auditColumns, companyId: text("company_id"), scopeType: text("scope_type").notNull(), scopeId: text("scope_id").notNull(), state: text("state", { enum: ["open", "awaiting_answer", "awaiting_confirmation", "completed", "paused", "archived"] }).notNull(), activeQuestionId: text("active_question_id") }, (t) => [index("interview_session_scope_idx").on(t.workspaceId, t.scopeType, t.scopeId, t.state), uniqueIndex("live_interview_destination_unique").on(t.workspaceId, t.scopeType, t.scopeId).where(sql`${t.state} in ('open', 'awaiting_answer', 'awaiting_confirmation', 'paused')`)]);
export const interviewQuestions = sqliteTable("interview_questions", { id: text("id").primaryKey(), ...auditColumns, sessionId: text("session_id").notNull().references(() => interviewSessions.id), version: integer("version").notNull(), prompt: text("prompt").notNull(), researchJson: text("research_json").notNull(), recommendation: text("recommendation"), status: text("status", { enum: ["draft", "active", "answered", "closed", "superseded"] }).notNull() }, (t) => [uniqueIndex("question_version_unique").on(t.workspaceId, t.sessionId, t.version)]);
export const interviewAnswers = sqliteTable("interview_answers", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), sessionId: text("session_id").notNull().references(() => interviewSessions.id), questionId: text("question_id").notNull().references(() => interviewQuestions.id), questionRevision: integer("question_revision").notNull(), choice: text("choice", { enum: ["accept_recommendation", "correct", "defer"] }).notNull(), correctionJson: text("correction_json"), idempotencyKey: text("idempotency_key").notNull(), operationDigest: text("operation_digest").notNull().default("legacy-unbound"), proposalJson: text("proposal_json").notNull().default("{}"), proposalDigest: text("proposal_digest").notNull().default("legacy-unbound"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("answer_question_unique").on(t.workspaceId, t.questionId), uniqueIndex("answer_idempotency_unique").on(t.workspaceId, t.idempotencyKey)]);
export const interviewConfirmations = sqliteTable("interview_confirmations", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), sessionId: text("session_id").notNull().references(() => interviewSessions.id), questionId: text("question_id").notNull().references(() => interviewQuestions.id), answerId: text("answer_id").notNull().references(() => interviewAnswers.id), decision: text("decision", { enum: ["accept", "reject", "correct", "rescope"] }).notNull(), knowledgeVersionId: text("knowledge_version_id").references(() => knowledgeVersions.id), idempotencyKey: text("idempotency_key").notNull(), operationDigest: text("operation_digest").notNull().default("legacy-unbound"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("confirmation_answer_unique").on(t.workspaceId, t.answerId), uniqueIndex("confirmation_idempotency_unique").on(t.workspaceId, t.idempotencyKey)]);
export const interviewAuthorityBindings = sqliteTable("interview_authority_bindings", { answerId: text("answer_id").primaryKey().references(() => interviewAnswers.id), confirmationId: text("confirmation_id").notNull().references(() => interviewConfirmations.id), knowledgeVersionId: text("knowledge_version_id").notNull().references(() => knowledgeVersions.id), knowledgeItemId: text("knowledge_item_id").notNull().references(() => knowledgeItems.id), proposalId: text("proposal_id"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() });
export const interviewAuthorityReview = sqliteTable("interview_authority_review", { answerId: text("answer_id").primaryKey().references(() => interviewAnswers.id), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), status: text("status", { enum: ["review_required", "resolved"] }).notNull(), reason: text("reason").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() });

export const configurations = sqliteTable("typed_configurations", { id: text("id").primaryKey(), ...auditColumns, companyId: text("company_id"), ownerType: text("owner_type", { enum: ["product", "profile"] }).notNull(), ownerId: text("owner_id").notNull(), kind: text("kind", { enum: ["product_discovery", "profile_effective"] }).notNull(), digest: text("digest").notNull(), manifestJson: text("manifest_json").notNull(), active: integer("active", { mode: "boolean" }).notNull().default(false) }, (t) => [uniqueIndex("config_digest_unique").on(t.workspaceId, t.kind, t.digest), uniqueIndex("active_configuration_owner_unique").on(t.workspaceId, t.ownerType, t.ownerId, t.kind).where(sql`${t.active} = 1`), index("config_owner_idx").on(t.workspaceId, t.ownerType, t.ownerId)]);
export const configurationKnowledgeDependencies = sqliteTable("configuration_knowledge_dependencies", { configurationId: text("configuration_id").notNull().references(() => configurations.id), knowledgeVersionId: text("knowledge_version_id").notNull().references(() => knowledgeVersions.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("configuration_knowledge_dependency_unique").on(t.configurationId, t.knowledgeVersionId)]);
export const artifactConfigurationDependencies = sqliteTable("artifact_configuration_dependencies", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), artifactType: text("artifact_type").notNull(), artifactId: text("artifact_id").notNull(), configurationId: text("configuration_id").notNull().references(() => configurations.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("artifact_configuration_dependency_unique").on(t.workspaceId, t.artifactType, t.artifactId, t.configurationId)]);
export const knowledgeDrifts = sqliteTable("knowledge_drifts", { id: text("id").primaryKey(), ...auditColumns, knowledgeItemId: text("knowledge_item_id").notNull().references(() => knowledgeItems.id), currentVersionId: text("current_version_id").notNull().references(() => knowledgeVersions.id), proposedVersionId: text("proposed_version_id").notNull().references(() => knowledgeVersions.id), proposalId: text("proposal_id").notNull().references(() => knowledgeProposals.id), riskKind: text("risk_kind", { enum: ["capability", "proof_point", "claim_guardrail", "offer", "suppression", "standard"] }).notNull(), dependencyDigest: text("dependency_digest").notNull(), status: text("status", { enum: ["open", "reviewed", "contained", "resolved"] }).notNull() });
export const driftImpactSnapshots = sqliteTable("drift_impact_snapshots", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), driftId: text("drift_id").notNull().references(() => knowledgeDrifts.id), impactJson: text("impact_json").notNull(), impactDigest: text("impact_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("drift_impact_digest_unique").on(t.driftId, t.impactDigest)]);
export const replacementCandidates = sqliteTable("replacement_candidates", { id: text("id").primaryKey(), ...auditColumns, ownerType: text("owner_type").notNull(), ownerId: text("owner_id").notNull(), currentConfigurationId: text("current_configuration_id").references(() => configurations.id), candidateConfigurationId: text("candidate_configuration_id").notNull().references(() => configurations.id), impactSnapshotId: text("impact_snapshot_id").notNull().references(() => driftImpactSnapshots.id), proposedVersionId: text("proposed_version_id").notNull().references(() => knowledgeVersions.id), expectedOwnerRevision: integer("expected_owner_revision").notNull(), candidateDigest: text("candidate_digest").notNull(), status: text("status", { enum: ["proposed", "activated", "superseded", "cancelled"] }).notNull().default("proposed") }, (t) => [uniqueIndex("replacement_candidate_digest_unique").on(t.workspaceId, t.candidateDigest)]);
export const configurationActivations = sqliteTable("configuration_activations", { id: text("id").primaryKey(), ...auditColumns, replacementCandidateId: text("replacement_candidate_id").notNull().references(() => replacementCandidates.id), authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id), previousConfigurationId: text("previous_configuration_id").references(() => configurations.id), nextConfigurationId: text("next_configuration_id").notNull().references(() => configurations.id), expectedOwnerRevision: integer("expected_owner_revision").notNull(), operationDigest: text("operation_digest").notNull() }, (t) => [uniqueIndex("configuration_activation_candidate_unique").on(t.replacementCandidateId), uniqueIndex("configuration_activation_command_unique").on(t.authorityCommandId)]);
export const phaseActivationGates = sqliteTable("phase_activation_gates", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), capability: text("capability", { enum: ["consensus_knowledge"] }).notNull(), authorizationReference: text("authorization_reference").notNull(), targetProjectDeployment: text("target_project_deployment").notNull(), reviewedSourceDigest: text("reviewed_source_digest").notNull(), migrationIdentityStatus: text("migration_identity_status").notNull(), postMigrationEvidenceReference: text("post_migration_evidence_reference").notNull(), independentReviewReference: text("independent_review_reference").notNull(), deployedBoundaryProofReference: text("deployed_boundary_proof_reference").notNull(), tupleDigest: text("tuple_digest").notNull(), acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("phase_gate_capability_unique").on(t.workspaceId, t.capability), uniqueIndex("phase_gate_tuple_unique").on(t.workspaceId, t.capability, t.tupleDigest)]);

export const productDiscoveryConfigurationPrerequisites = sqliteTable(
  "product_discovery_configuration_prerequisites",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    productId: text("product_id").notNull().references(() => products.id),
    configurationId: text("configuration_id").notNull().references(() => configurations.id),
    knowledgeVersionId: text("knowledge_version_id").notNull().references(() => knowledgeVersions.id),
    knowledgeVersionDigest: text("knowledge_version_digest").notNull(),
    category: text("category", { enum: ["capability", "limitation", "delivery", "proof", "ownership", "claim_guardrail", "source_policy", "discovery_policy", "default_runner_policy"] }).notNull(),
    ordinal: integer("ordinal").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("product_discovery_prerequisite_version_unique").on(t.configurationId, t.knowledgeVersionId),
    uniqueIndex("product_discovery_prerequisite_category_unique").on(t.configurationId, t.category),
    uniqueIndex("product_discovery_prerequisite_ordinal_unique").on(t.configurationId, t.ordinal),
    index("product_discovery_prerequisite_product_idx").on(t.workspaceId, t.productId),
    check("product_discovery_prerequisite_digest_check", sql`length(${t.knowledgeVersionDigest}) = 64 and ${t.knowledgeVersionDigest} not glob '*[^0-9a-f]*'`),
    check("product_discovery_prerequisite_ordinal_check", sql`${t.ordinal} >= 0 and ${t.ordinal} < 9`),
  ],
);

export const productDiscoverySchedules = sqliteTable(
  "product_discovery_schedules",
  {
    id: text("id").primaryKey(),
    ...auditColumns,
    productId: text("product_id").notNull().references(() => products.id),
    configurationId: text("configuration_id").notNull().references(() => configurations.id),
    configurationDigest: text("configuration_digest").notNull(),
    cadence: text("cadence", { enum: ["monthly"] }).notNull(),
    scheduleKey: text("schedule_key").notNull(),
    timezone: text("timezone").notNull(),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
    lastSuccessfulWatermark: integer("last_successful_watermark", { mode: "timestamp_ms" }),
    executionState: text("execution_state", { enum: ["blocked_missing_capability", "active", "paused", "needs_attention", "archived"] }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    operationDigest: text("operation_digest").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
  },
  (t) => [
    uniqueIndex("product_discovery_schedule_key_unique").on(t.workspaceId, t.scheduleKey),
    uniqueIndex("product_discovery_schedule_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
    uniqueIndex("product_discovery_active_schedule_unique").on(t.workspaceId, t.productId, t.cadence).where(sql`${t.active} = 1`),
    index("product_discovery_schedule_due_idx").on(t.workspaceId, t.executionState, t.nextRunAt),
    check("product_discovery_schedule_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`),
    check("product_discovery_schedule_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`),
  ],
);

export const productDiscoveryRuns = sqliteTable(
  "product_discovery_runs",
  {
    id: text("id").primaryKey(),
    ...auditColumns,
    productId: text("product_id").notNull().references(() => products.id),
    configurationId: text("configuration_id").notNull().references(() => configurations.id),
    configurationDigest: text("configuration_digest").notNull(),
    triggerKind: text("trigger_kind", { enum: ["initial", "monthly", "manual", "material_change"] }).notNull(),
    triggerKey: text("trigger_key").notNull(),
    sourceEventId: text("source_event_id"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    windowLowerExclusive: integer("window_lower_exclusive", { mode: "timestamp_ms" }),
    windowUpperInclusive: integer("window_upper_inclusive", { mode: "timestamp_ms" }).notNull(),
    lastSuccessfulWatermark: integer("last_successful_watermark", { mode: "timestamp_ms" }),
    successfulWatermark: integer("successful_watermark", { mode: "timestamp_ms" }),
    manifestJson: text("manifest_json").notNull(),
    manifestDigest: text("manifest_digest").notNull(),
    policySnapshotJson: text("policy_snapshot_json").notNull(),
    policySnapshotDigest: text("policy_snapshot_digest").notNull(),
    executionState: text("execution_state", { enum: ["blocked_missing_capability", "queued", "running", "authority_unknown", "succeeded", "needs_attention", "failed"] }).notNull(),
    operationDigest: text("operation_digest").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("product_discovery_run_trigger_unique").on(t.workspaceId, t.productId, t.triggerKey),
    uniqueIndex("product_discovery_run_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
    uniqueIndex("product_discovery_run_operation_unique").on(t.workspaceId, t.operationDigest),
    index("product_discovery_run_product_idx").on(t.workspaceId, t.productId, t.startedAt),
    check("product_discovery_run_configuration_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`),
    check("product_discovery_run_manifest_digest_check", sql`length(${t.manifestDigest}) = 64 and ${t.manifestDigest} not glob '*[^0-9a-f]*'`),
    check("product_discovery_run_policy_digest_check", sql`length(${t.policySnapshotDigest}) = 64 and ${t.policySnapshotDigest} not glob '*[^0-9a-f]*'`),
    check("product_discovery_run_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`),
    check("product_discovery_run_window_check", sql`${t.windowLowerExclusive} is null or ${t.windowLowerExclusive} < ${t.windowUpperInclusive}`),
  ],
);

export const productDiscoveryRunEvents = sqliteTable(
  "product_discovery_run_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    runId: text("run_id").notNull().references(() => productDiscoveryRuns.id),
    eventType: text("event_type", { enum: ["created", "blocked", "started", "submission_received", "authority_unknown", "succeeded", "needs_attention", "failed", "watermark_advanced"] }).notNull(),
    eventJson: text("event_json").notNull(),
    eventDigest: text("event_digest").notNull(),
    operationDigest: text("operation_digest").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("product_discovery_run_event_operation_unique").on(t.workspaceId, t.operationDigest),
    uniqueIndex("product_discovery_run_event_digest_unique").on(t.runId, t.eventDigest),
    index("product_discovery_run_event_order_idx").on(t.runId, t.createdAt),
    check("product_discovery_run_event_digest_check", sql`length(${t.eventDigest}) = 64 and ${t.eventDigest} not glob '*[^0-9a-f]*'`),
    check("product_discovery_run_event_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`),
  ],
);

export const productDiscoverySubmissions = sqliteTable(
  "product_discovery_submissions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    productId: text("product_id").notNull().references(() => products.id),
    runId: text("run_id").notNull().references(() => productDiscoveryRuns.id),
    configurationId: text("configuration_id").notNull().references(() => configurations.id),
    provenanceJson: text("provenance_json").notNull(),
    provenanceDigest: text("provenance_digest").notNull(),
    submissionJson: text("submission_json").notNull(),
    submissionDigest: text("submission_digest").notNull(),
    resultJson: text("result_json").notNull(),
    resultDigest: text("result_digest").notNull(),
    status: text("status", { enum: ["partial", "authority_unknown", "succeeded", "rejected"] }).notNull(),
    operationDigest: text("operation_digest").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("product_discovery_submission_key_unique").on(t.workspaceId, t.idempotencyKey),
    uniqueIndex("product_discovery_submission_operation_unique").on(t.workspaceId, t.operationDigest),
    uniqueIndex("product_discovery_submission_digest_unique").on(t.runId, t.submissionDigest),
    index("product_discovery_submission_run_idx").on(t.runId, t.createdAt),
    check("product_discovery_submission_digest_check", sql`length(${t.submissionDigest}) = 64 and ${t.submissionDigest} not glob '*[^0-9a-f]*'`),
    check("product_discovery_submission_result_digest_check", sql`length(${t.resultDigest}) = 64 and ${t.resultDigest} not glob '*[^0-9a-f]*'`),
    check("product_discovery_submission_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`),
  ],
);

export const marketPlayProposals = sqliteTable(
  "market_play_proposals",
  {
    id: text("id").primaryKey(),
    ...auditColumns,
    productId: text("product_id").notNull().references(() => products.id),
    runId: text("run_id").notNull().references(() => productDiscoveryRuns.id),
    fingerprint: text("fingerprint").notNull(),
    currentVersionId: text("current_version_id"),
    status: text("status", { enum: ["new", "explored", "deferred", "dismissed", "merged", "split", "superseded"] }).notNull().default("new"),
    surfaced: integer("surfaced", { mode: "boolean" }).notNull().default(false),
    rank: integer("rank"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    cooldownUntil: integer("cooldown_until", { mode: "timestamp_ms" }),
  },
  (t) => [
    uniqueIndex("market_play_proposal_active_fingerprint_unique").on(t.workspaceId, t.productId, t.fingerprint).where(sql`${t.active} = 1`),
    uniqueIndex("market_play_proposal_run_rank_unique").on(t.runId, t.rank).where(sql`${t.surfaced} = 1`),
    index("market_play_proposal_product_status_idx").on(t.workspaceId, t.productId, t.status),
    check("market_play_proposal_fingerprint_check", sql`length(${t.fingerprint}) = 64 and ${t.fingerprint} not glob '*[^0-9a-f]*'`),
    check("market_play_proposal_rank_check", sql`${t.rank} is null or (${t.rank} >= 1 and ${t.rank} <= 3)`),
  ],
);

export const marketPlayProposalVersions = sqliteTable(
  "market_play_proposal_versions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    productId: text("product_id").notNull().references(() => products.id),
    proposalId: text("proposal_id").notNull().references(() => marketPlayProposals.id),
    runId: text("run_id").notNull().references(() => productDiscoveryRuns.id),
    submissionId: text("submission_id").notNull().references(() => productDiscoverySubmissions.id),
    version: integer("version").notNull(),
    proposalJson: text("proposal_json").notNull(),
    proposalDigest: text("proposal_digest").notNull(),
    materialEvidenceFingerprint: text("material_evidence_fingerprint").notNull(),
    predecessorVersionId: text("predecessor_version_id"),
    relationship: text("relationship", { enum: ["new", "evidence_attached", "split", "merge", "reopen"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("market_play_proposal_version_unique").on(t.proposalId, t.version),
    uniqueIndex("market_play_proposal_version_digest_unique").on(t.proposalId, t.proposalDigest),
    uniqueIndex("market_play_proposal_version_submission_unique").on(t.submissionId, t.proposalId),
    index("market_play_proposal_version_run_idx").on(t.runId, t.createdAt),
    check("market_play_proposal_version_number_check", sql`${t.version} > 0`),
    check("market_play_proposal_version_digest_check", sql`length(${t.proposalDigest}) = 64 and ${t.proposalDigest} not glob '*[^0-9a-f]*'`),
  ],
);

export const marketPlayProposalEvidence = sqliteTable(
  "market_play_proposal_evidence",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    proposalId: text("proposal_id").notNull().references(() => marketPlayProposals.id),
    proposalVersionId: text("proposal_version_id").notNull().references(() => marketPlayProposalVersions.id),
    reference: text("reference").notNull(),
    evidenceJson: text("evidence_json").notNull(),
    evidenceDigest: text("evidence_digest").notNull(),
    materialEvidenceFingerprint: text("material_evidence_fingerprint").notNull(),
    observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("market_play_proposal_evidence_digest_unique").on(t.proposalVersionId, t.evidenceDigest),
    uniqueIndex("market_play_proposal_evidence_reference_unique").on(t.proposalVersionId, t.reference),
    index("market_play_proposal_evidence_proposal_idx").on(t.proposalId, t.createdAt),
    check("market_play_proposal_evidence_digest_check", sql`length(${t.evidenceDigest}) = 64 and ${t.evidenceDigest} not glob '*[^0-9a-f]*'`),
  ],
);

export const marketPlayProposalDecisions = sqliteTable(
  "market_play_proposal_decisions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    productId: text("product_id").notNull().references(() => products.id),
    proposalId: text("proposal_id").notNull().references(() => marketPlayProposals.id),
    proposalVersionId: text("proposal_version_id").notNull().references(() => marketPlayProposalVersions.id),
    expectedProposalRevision: integer("expected_proposal_revision").notNull(),
    expectedProposalDigest: text("expected_proposal_digest").notNull(),
    decision: text("decision", { enum: ["explore", "defer", "dismiss"] }).notNull(),
    reason: text("reason"),
    reviewAt: integer("review_at", { mode: "timestamp_ms" }),
    cooldownUntil: integer("cooldown_until", { mode: "timestamp_ms" }),
    confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
    draftMarketPlayId: text("draft_market_play_id").references(() => marketPlays.id),
    interviewSessionId: text("interview_session_id").references(() => interviewSessions.id),
    decisionJson: text("decision_json").notNull(),
    decisionDigest: text("decision_digest").notNull(),
    operationDigest: text("operation_digest").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("market_play_proposal_decision_version_unique").on(t.proposalVersionId),
    uniqueIndex("market_play_proposal_decision_key_unique").on(t.workspaceId, t.idempotencyKey),
    uniqueIndex("market_play_proposal_decision_operation_unique").on(t.workspaceId, t.operationDigest),
    index("market_play_proposal_decision_proposal_idx").on(t.proposalId, t.createdAt),
    check("market_play_proposal_decision_digest_check", sql`length(${t.decisionDigest}) = 64 and ${t.decisionDigest} not glob '*[^0-9a-f]*'`),
    check("market_play_proposal_decision_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`),
  ],
);

export const marketPlayProposalLineage = sqliteTable(
  "market_play_proposal_lineage",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    productId: text("product_id").notNull().references(() => products.id),
    relationship: text("relationship", { enum: ["collision", "evidence_attached", "split", "merge", "reopen"] }).notNull(),
    sourceProposalId: text("source_proposal_id").notNull().references(() => marketPlayProposals.id),
    sourceVersionId: text("source_version_id").references(() => marketPlayProposalVersions.id),
    targetProposalId: text("target_proposal_id").notNull().references(() => marketPlayProposals.id),
    targetVersionId: text("target_version_id").references(() => marketPlayProposalVersions.id),
    changedField: text("changed_field"),
    evidenceReference: text("evidence_reference"),
    lineageJson: text("lineage_json").notNull(),
    lineageDigest: text("lineage_digest").notNull(),
    operationDigest: text("operation_digest").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("market_play_proposal_lineage_operation_unique").on(t.workspaceId, t.operationDigest),
    uniqueIndex("market_play_proposal_lineage_digest_unique").on(t.workspaceId, t.lineageDigest),
    index("market_play_proposal_lineage_source_idx").on(t.sourceProposalId, t.createdAt),
    index("market_play_proposal_lineage_target_idx").on(t.targetProposalId, t.createdAt),
    check("market_play_proposal_lineage_digest_check", sql`length(${t.lineageDigest}) = 64 and ${t.lineageDigest} not glob '*[^0-9a-f]*'`),
    check("market_play_proposal_lineage_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`),
  ],
);

export const productConfigurationLineage = sqliteTable(
  "product_configuration_lineage",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    productId: text("product_id").notNull().references(() => products.id),
    replacementActivationId: text("replacement_activation_id").notNull().references(() => configurationActivations.id),
    predecessorConfigurationId: text("predecessor_configuration_id").notNull().references(() => configurations.id),
    successorConfigurationId: text("successor_configuration_id").notNull().references(() => configurations.id),
    materialChangeRunId: text("material_change_run_id").notNull().references(() => productDiscoveryRuns.id),
    lineageJson: text("lineage_json").notNull(),
    lineageDigest: text("lineage_digest").notNull(),
    operationDigest: text("operation_digest").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("product_configuration_lineage_activation_unique").on(t.replacementActivationId),
    uniqueIndex("product_configuration_lineage_successor_unique").on(t.workspaceId, t.productId, t.successorConfigurationId),
    uniqueIndex("product_configuration_lineage_operation_unique").on(t.workspaceId, t.operationDigest),
    check("product_configuration_lineage_digest_check", sql`length(${t.lineageDigest}) = 64 and ${t.lineageDigest} not glob '*[^0-9a-f]*'`),
    check("product_configuration_lineage_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`),
  ],
);

export const privateSyntheticProofAuthorizations = sqliteTable(
  "private_synthetic_proof_authorizations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    ownerSubjectId: text("owner_subject_id").notNull(),
    productId: text("product_id").notNull().references(() => products.id),
    expectedProductRevision: integer("expected_product_revision").notNull(),
    interviewConfirmationId: text("interview_confirmation_id").notNull().references(() => interviewConfirmations.id),
    confirmedKnowledgeVersionId: text("confirmed_knowledge_version_id").notNull().references(() => knowledgeVersions.id),
    runId: text("run_id").notNull().references(() => productDiscoveryRuns.id),
    configurationId: text("configuration_id").notNull().references(() => configurations.id),
    configurationDigest: text("configuration_digest").notNull(),
    reviewedSourceRevision: text("reviewed_source_revision").notNull(),
    migrationDigest: text("migration_digest").notNull(),
    fixtureDigest: text("fixture_digest").notNull(),
    fixtureProvenance: text("fixture_provenance").notNull(),
    evidenceReference: text("evidence_reference").notNull(),
    capability: text("capability", { enum: ["private-hosted-synthetic-proposal-proof"] }).notNull(),
    authorizationDigest: text("authorization_digest").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("private_synthetic_proof_authorization_digest_unique").on(t.workspaceId, t.authorizationDigest),
    uniqueIndex("private_synthetic_proof_authorization_evidence_run_unique").on(t.workspaceId, t.evidenceReference, t.runId, t.configurationId, t.configurationDigest),
    index("private_synthetic_proof_authorization_lookup_idx").on(t.workspaceId, t.productId, t.capability, t.expiresAt),
    check("private_synthetic_proof_migration_digest_check", sql`length(${t.migrationDigest}) = 64 and ${t.migrationDigest} not glob '*[^0-9a-f]*'`),
    check("private_synthetic_proof_fixture_digest_check", sql`length(${t.fixtureDigest}) = 64 and ${t.fixtureDigest} not glob '*[^0-9a-f]*'`),
    check("private_synthetic_proof_configuration_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`),
    check("private_synthetic_proof_authorization_digest_check", sql`length(${t.authorizationDigest}) = 64 and ${t.authorizationDigest} not glob '*[^0-9a-f]*'`),
    check("private_synthetic_proof_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

export const privateSyntheticProofConsumptions = sqliteTable(
  "private_synthetic_proof_consumptions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
    productId: text("product_id").notNull().references(() => products.id),
    authorizationId: text("authorization_id").notNull().references(() => privateSyntheticProofAuthorizations.id),
    operationDigest: text("operation_digest").notNull(),
    winnerRunId: text("winner_run_id").notNull().references(() => productDiscoveryRuns.id),
    winnerSubmissionId: text("winner_submission_id").notNull().references(() => productDiscoverySubmissions.id),
    resultJson: text("result_json").notNull(),
    resultDigest: text("result_digest").notNull(),
    auditEventId: text("audit_event_id").notNull().references(() => auditEvents.id),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("private_synthetic_proof_consumption_authorization_unique").on(t.authorizationId),
    uniqueIndex("private_synthetic_proof_consumption_operation_unique").on(t.workspaceId, t.operationDigest),
    uniqueIndex("private_synthetic_proof_consumption_result_unique").on(t.authorizationId, t.resultDigest),
    check("private_synthetic_proof_consumption_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`),
    check("private_synthetic_proof_consumption_result_digest_check", sql`length(${t.resultDigest}) = 64 and ${t.resultDigest} not glob '*[^0-9a-f]*'`),
  ],
);

// Phase 4 records are deliberately separate from the legacy placeholder `prospects`
// table below.  They are append-only facts and projections; no contact, provider, or
// outbound-effect authority is represented here.
export const profileConfigurationCandidates = sqliteTable("profile_configuration_candidates", {
  id: text("id").primaryKey(), ...auditColumns,
  profileId: text("profile_id").notNull().references(() => profiles.id),
  configurationId: text("configuration_id").notNull().references(() => configurations.id),
  predecessorConfigurationId: text("predecessor_configuration_id").references(() => configurations.id),
  authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id),
  auditEventId: text("audit_event_id").notNull().references(() => auditEvents.id),
  candidateDigest: text("candidate_digest").notNull(), status: text("status", { enum: ["candidate", "activated", "superseded", "cancelled"] }).notNull().default("candidate"),
}, (t) => [uniqueIndex("profile_configuration_candidate_digest_unique").on(t.workspaceId, t.profileId, t.candidateDigest), uniqueIndex("profile_configuration_candidate_command_unique").on(t.authorityCommandId), index("profile_configuration_candidate_profile_idx").on(t.workspaceId, t.profileId, t.status), check("profile_configuration_candidate_digest_check", sql`length(${t.candidateDigest}) = 64 and ${t.candidateDigest} not glob '*[^0-9a-f]*'`)]);

export const profileConfigurationActivations = sqliteTable("profile_configuration_activations", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  profileId: text("profile_id").notNull().references(() => profiles.id), candidateId: text("candidate_id").notNull().references(() => profileConfigurationCandidates.id),
  previousConfigurationId: text("previous_configuration_id").references(() => configurations.id), configurationId: text("configuration_id").notNull().references(() => configurations.id),
  authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id), auditEventId: text("audit_event_id").notNull().references(() => auditEvents.id),
  operationDigest: text("operation_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [uniqueIndex("profile_configuration_activation_candidate_unique").on(t.candidateId), uniqueIndex("profile_configuration_activation_command_unique").on(t.authorityCommandId), uniqueIndex("profile_configuration_activation_operation_unique").on(t.workspaceId, t.operationDigest), check("profile_configuration_activation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`)]);

export const prospectingSchedules = sqliteTable("prospecting_schedules", {
  id: text("id").primaryKey(), ...auditColumns, profileId: text("profile_id").notNull().references(() => profiles.id), configurationId: text("configuration_id").notNull().references(() => configurations.id),
  configurationDigest: text("configuration_digest").notNull(), scheduleKey: text("schedule_key").notNull(), timezone: text("timezone").notNull(), intendedLocalTime: text("intended_local_time").notNull(), utcOffsetMinutes: integer("utc_offset_minutes").notNull(),
  cadence: text("cadence", { enum: ["weekdays"] }).notNull(), nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(), lastSuccessfulWatermark: integer("last_successful_watermark", { mode: "timestamp_ms" }), active: integer("active", { mode: "boolean" }).notNull().default(true), executionState: text("execution_state", { enum: ["blocked_missing_capability", "active", "paused", "archived"] }).notNull(), authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id),
  operationDigest: text("operation_digest").notNull(), idempotencyKey: text("idempotency_key").notNull(),
}, (t) => [uniqueIndex("prospecting_schedule_key_unique").on(t.workspaceId, t.scheduleKey), uniqueIndex("prospecting_schedule_active_profile_unique").on(t.workspaceId, t.profileId).where(sql`${t.active} = 1`), uniqueIndex("prospecting_schedule_command_unique").on(t.authorityCommandId), uniqueIndex("prospecting_schedule_idempotency_unique").on(t.workspaceId, t.idempotencyKey), index("prospecting_schedule_due_idx").on(t.workspaceId, t.executionState, t.nextRunAt), check("prospecting_schedule_configuration_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`), check("prospecting_schedule_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`)]);

export const prospectingRuns = sqliteTable("prospecting_runs", {
  id: text("id").primaryKey(), ...auditColumns, profileId: text("profile_id").notNull().references(() => profiles.id), configurationId: text("configuration_id").notNull().references(() => configurations.id), scheduleId: text("schedule_id").references(() => prospectingSchedules.id),
  configurationDigest: text("configuration_digest").notNull(), triggerKind: text("trigger_kind", { enum: ["initial", "scheduled", "manual", "material_change"] }).notNull(), triggerKey: text("trigger_key").notNull(), windowLowerExclusive: integer("window_lower_exclusive", { mode: "timestamp_ms" }), windowUpperInclusive: integer("window_upper_inclusive", { mode: "timestamp_ms" }).notNull(), lastSuccessfulWatermark: integer("last_successful_watermark", { mode: "timestamp_ms" }), successfulWatermark: integer("successful_watermark", { mode: "timestamp_ms" }),
  manifestJson: text("manifest_json").notNull(), manifestDigest: text("manifest_digest").notNull(), executionState: text("execution_state", { enum: ["blocked_missing_capability", "queued", "assigned", "running", "submitted", "validating", "succeeded", "rejected", "failed", "cancelled", "expired", "skipped_overlap"] }).notNull(), authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id), operationDigest: text("operation_digest").notNull(), idempotencyKey: text("idempotency_key").notNull(), startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(), completedAt: integer("completed_at", { mode: "timestamp_ms" }),
}, (t) => [uniqueIndex("prospecting_run_trigger_unique").on(t.workspaceId, t.profileId, t.triggerKey), uniqueIndex("prospecting_run_idempotency_unique").on(t.workspaceId, t.idempotencyKey), uniqueIndex("prospecting_run_operation_unique").on(t.workspaceId, t.operationDigest), uniqueIndex("prospecting_initial_run_unique").on(t.workspaceId, t.configurationId).where(sql`${t.triggerKind} = 'initial'`), index("prospecting_run_profile_idx").on(t.workspaceId, t.profileId, t.startedAt), check("prospecting_run_configuration_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`), check("prospecting_run_manifest_digest_check", sql`length(${t.manifestDigest}) = 64 and ${t.manifestDigest} not glob '*[^0-9a-f]*'`), check("prospecting_run_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`), check("prospecting_run_window_check", sql`${t.windowLowerExclusive} is null or ${t.windowLowerExclusive} < ${t.windowUpperInclusive}`)]);

export const prospectingRunEvents = sqliteTable("prospecting_run_events", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), runId: text("run_id").notNull().references(() => prospectingRuns.id), eventType: text("event_type", { enum: ["created", "assigned", "started", "submission_received", "validating", "succeeded", "rejected", "failed", "cancelled", "expired", "skipped_overlap", "watermark_advanced"] }).notNull(), eventJson: text("event_json").notNull(), eventDigest: text("event_digest").notNull(), operationDigest: text("operation_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("prospecting_run_event_operation_unique").on(t.workspaceId, t.operationDigest), uniqueIndex("prospecting_run_event_digest_unique").on(t.runId, t.eventDigest), index("prospecting_run_event_order_idx").on(t.runId, t.createdAt), check("prospecting_run_event_digest_check", sql`length(${t.eventDigest}) = 64 and ${t.eventDigest} not glob '*[^0-9a-f]*'`), check("prospecting_run_event_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`)]);

export const runnerAssignments = sqliteTable("runner_assignments", { id: text("id").primaryKey(), ...auditColumns, runId: text("run_id").notNull().references(() => prospectingRuns.id), profileId: text("profile_id").notNull().references(() => profiles.id), configurationId: text("configuration_id").notNull().references(() => configurations.id), configurationDigest: text("configuration_digest").notNull(), audience: text("audience").notNull(), tokenHash: text("token_hash").notNull(), nonceHash: text("nonce_hash").notNull(), instructionVersion: text("instruction_version").notNull(), toolConfigurationDigest: text("tool_configuration_digest").notNull(), quotaJson: text("quota_json").notNull(), quotaDigest: text("quota_digest").notNull(), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), status: text("status", { enum: ["issued", "revoked", "consumed", "expired"] }).notNull().default("issued"), authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id), auditEventId: text("audit_event_id").notNull().references(() => auditEvents.id) }, (t) => [uniqueIndex("runner_assignment_token_hash_unique").on(t.workspaceId, t.tokenHash), uniqueIndex("runner_assignment_nonce_hash_unique").on(t.workspaceId, t.nonceHash), uniqueIndex("runner_assignment_command_unique").on(t.authorityCommandId), index("runner_assignment_run_idx").on(t.workspaceId, t.runId, t.status), check("runner_assignment_configuration_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`), check("runner_assignment_token_hash_check", sql`length(${t.tokenHash}) = 64 and ${t.tokenHash} not glob '*[^0-9a-f]*'`), check("runner_assignment_nonce_hash_check", sql`length(${t.nonceHash}) = 64 and ${t.nonceHash} not glob '*[^0-9a-f]*'`), check("runner_assignment_quota_digest_check", sql`length(${t.quotaDigest}) = 64 and ${t.quotaDigest} not glob '*[^0-9a-f]*'`)]);

export const runnerAssignmentRevocations = sqliteTable("runner_assignment_revocations", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), assignmentId: text("assignment_id").notNull().references(() => runnerAssignments.id), reason: text("reason").notNull(), authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id), auditEventId: text("audit_event_id").notNull().references(() => auditEvents.id), operationDigest: text("operation_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("runner_assignment_revocation_assignment_unique").on(t.assignmentId), uniqueIndex("runner_assignment_revocation_command_unique").on(t.authorityCommandId), uniqueIndex("runner_assignment_revocation_operation_unique").on(t.workspaceId, t.operationDigest), check("runner_assignment_revocation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`)]);

export const runnerSubmissions = sqliteTable("runner_submissions", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), runId: text("run_id").notNull().references(() => prospectingRuns.id), assignmentId: text("assignment_id").notNull().references(() => runnerAssignments.id), configurationId: text("configuration_id").notNull().references(() => configurations.id), submissionJson: text("submission_json").notNull(), submissionDigest: text("submission_digest").notNull(), provenanceJson: text("provenance_json").notNull(), provenanceDigest: text("provenance_digest").notNull(), status: text("status", { enum: ["received", "accepted", "rejected"] }).notNull(), operationDigest: text("operation_digest").notNull(), idempotencyKey: text("idempotency_key").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("runner_submission_key_unique").on(t.workspaceId, t.idempotencyKey), uniqueIndex("runner_submission_operation_unique").on(t.workspaceId, t.operationDigest), uniqueIndex("runner_submission_digest_unique").on(t.assignmentId, t.submissionDigest), index("runner_submission_run_idx").on(t.runId, t.createdAt), check("runner_submission_digest_check", sql`length(${t.submissionDigest}) = 64 and ${t.submissionDigest} not glob '*[^0-9a-f]*'`), check("runner_submission_provenance_digest_check", sql`length(${t.provenanceDigest}) = 64 and ${t.provenanceDigest} not glob '*[^0-9a-f]*'`), check("runner_submission_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`)]);

export const prospectingSourceLineage = sqliteTable("prospecting_source_lineage", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), runId: text("run_id").notNull().references(() => prospectingRuns.id), submissionId: text("submission_id").notNull().references(() => runnerSubmissions.id), sourceId: text("source_id").references(() => sources.id), sourceUrl: text("source_url").notNull(), publisherIdentity: text("publisher_identity").notNull(), underlyingOriginIdentity: text("underlying_origin_identity").notNull(), independenceGroup: text("independence_group").notNull(), sourceTier: integer("source_tier").notNull(), publishedAt: integer("published_at", { mode: "timestamp_ms" }), occurredAt: integer("occurred_at", { mode: "timestamp_ms" }), retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(), excerpt: text("excerpt").notNull(), lineageJson: text("lineage_json").notNull(), lineageDigest: text("lineage_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("prospecting_source_lineage_digest_unique").on(t.runId, t.lineageDigest), index("prospecting_source_lineage_run_idx").on(t.runId, t.retrievedAt), check("prospecting_source_lineage_tier_check", sql`${t.sourceTier} between 1 and 3`), check("prospecting_source_lineage_digest_check", sql`length(${t.lineageDigest}) = 64 and ${t.lineageDigest} not glob '*[^0-9a-f]*'`)]);

export const prospectingSignals = sqliteTable("prospecting_signals", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), runId: text("run_id").notNull().references(() => prospectingRuns.id), submissionId: text("submission_id").notNull().references(() => runnerSubmissions.id), sourceLineageId: text("source_lineage_id").notNull().references(() => prospectingSourceLineage.id), profileId: text("profile_id").notNull().references(() => profiles.id), signalKind: text("signal_kind").notNull(), signalJson: text("signal_json").notNull(), signalDigest: text("signal_digest").notNull(), material: integer("material", { mode: "boolean" }).notNull().default(false), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("prospecting_signal_digest_unique").on(t.workspaceId, t.signalDigest), index("prospecting_signal_profile_idx").on(t.workspaceId, t.profileId, t.createdAt), check("prospecting_signal_digest_check", sql`length(${t.signalDigest}) = 64 and ${t.signalDigest} not glob '*[^0-9a-f]*'`)]);

export const prospectingCandidates = sqliteTable("prospecting_candidates", { id: text("id").primaryKey(), ...auditColumns, profileId: text("profile_id").notNull().references(() => profiles.id), offerId: text("offer_id").notNull().references(() => offers.id), runId: text("run_id").notNull().references(() => prospectingRuns.id), submissionId: text("submission_id").notNull().references(() => runnerSubmissions.id), configurationId: text("configuration_id").notNull().references(() => configurations.id), fingerprint: text("fingerprint").notNull(), candidateJson: text("candidate_json").notNull(), candidateDigest: text("candidate_digest").notNull(), predecessorCandidateId: text("predecessor_candidate_id").references(() => prospectingCandidates.id), status: text("status", { enum: ["observed", "qualified", "not_qualified", "insufficient_evidence", "disqualified", "reopened"] }).notNull().default("observed") }, (t) => [uniqueIndex("prospecting_candidate_fingerprint_unique").on(t.workspaceId, t.profileId, t.offerId, t.configurationId, t.fingerprint), uniqueIndex("prospecting_candidate_digest_unique").on(t.workspaceId, t.candidateDigest), index("prospecting_candidate_profile_status_idx").on(t.workspaceId, t.profileId, t.status), check("prospecting_candidate_fingerprint_check", sql`length(${t.fingerprint}) = 64 and ${t.fingerprint} not glob '*[^0-9a-f]*'`), check("prospecting_candidate_digest_check", sql`length(${t.candidateDigest}) = 64 and ${t.candidateDigest} not glob '*[^0-9a-f]*'`)]);

export const qualificationAssessments = sqliteTable("qualification_assessments", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), candidateId: text("candidate_id").notNull().references(() => prospectingCandidates.id), configurationId: text("configuration_id").notNull().references(() => configurations.id), configurationDigest: text("configuration_digest").notNull(), inputJson: text("input_json").notNull(), inputDigest: text("input_digest").notNull(), anchorJson: text("anchor_json").notNull(), evidenceJson: text("evidence_json").notNull(), gateJson: text("gate_json").notNull(), scoreJson: text("score_json").notNull(), score: integer("score").notNull(), outcome: text("outcome", { enum: ["Passed", "NotQualified", "InsufficientEvidence", "Disqualified"] }).notNull(), tieOrder: text("tie_order").notNull(), assessmentDigest: text("assessment_digest").notNull(), predecessorAssessmentId: text("predecessor_assessment_id").references(() => qualificationAssessments.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("qualification_assessment_digest_unique").on(t.workspaceId, t.assessmentDigest), index("qualification_assessment_candidate_idx").on(t.candidateId, t.createdAt), check("qualification_assessment_configuration_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`), check("qualification_assessment_input_digest_check", sql`length(${t.inputDigest}) = 64 and ${t.inputDigest} not glob '*[^0-9a-f]*'`), check("qualification_assessment_digest_check", sql`length(${t.assessmentDigest}) = 64 and ${t.assessmentDigest} not glob '*[^0-9a-f]*'`), check("qualification_assessment_score_check", sql`${t.score} between 0 and 10`)]);

export const profileProspects = sqliteTable("profile_prospects", { id: text("id").primaryKey(), ...auditColumns, profileId: text("profile_id").notNull().references(() => profiles.id), offerId: text("offer_id").notNull().references(() => offers.id), candidateId: text("candidate_id").notNull().references(() => prospectingCandidates.id), assessmentId: text("assessment_id").notNull().references(() => qualificationAssessments.id), fingerprint: text("fingerprint").notNull(), state: text("state", { enum: ["qualified", "approved", "rejected", "deferred", "cooled_down"] }).notNull().default("qualified"), active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(), revision: integer("revision").notNull().default(1) }, (t) => [uniqueIndex("profile_prospect_active_fingerprint_unique").on(t.workspaceId, t.fingerprint).where(sql`${t.active} = 1`), uniqueIndex("profile_prospect_assessment_unique").on(t.assessmentId), index("profile_prospect_queue_idx").on(t.workspaceId, t.profileId, t.state), check("profile_prospect_fingerprint_check", sql`length(${t.fingerprint}) = 64 and ${t.fingerprint} not glob '*[^0-9a-f]*'`)]);

export const prospectReviewDecisions = sqliteTable("prospect_review_decisions", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), prospectId: text("prospect_id").notNull().references(() => profileProspects.id), assessmentId: text("assessment_id").notNull().references(() => qualificationAssessments.id), decision: text("decision", { enum: ["approve", "reject", "defer"] }).notNull(), reason: text("reason").notNull(), reviewAt: integer("review_at", { mode: "timestamp_ms" }), expectedProspectRevision: integer("expected_prospect_revision").notNull(), authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id), auditEventId: text("audit_event_id").notNull().references(() => auditEvents.id), decisionDigest: text("decision_digest").notNull(), operationDigest: text("operation_digest").notNull(), idempotencyKey: text("idempotency_key").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("prospect_review_decision_key_unique").on(t.workspaceId, t.idempotencyKey), uniqueIndex("prospect_review_decision_operation_unique").on(t.workspaceId, t.operationDigest), uniqueIndex("prospect_review_decision_command_unique").on(t.authorityCommandId), index("prospect_review_decision_prospect_idx").on(t.prospectId, t.createdAt), check("prospect_review_decision_digest_check", sql`length(${t.decisionDigest}) = 64 and ${t.decisionDigest} not glob '*[^0-9a-f]*'`), check("prospect_review_decision_operation_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`)]);

export const prospectCooldowns = sqliteTable("prospect_cooldowns", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), prospectId: text("prospect_id").notNull().references(() => profileProspects.id), reviewDecisionId: text("review_decision_id").references(() => prospectReviewDecisions.id), assessmentId: text("assessment_id").references(() => qualificationAssessments.id), reason: text("reason").notNull(), startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(), endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(), status: text("status", { enum: ["active", "released", "superseded"] }).notNull().default("active"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("prospect_cooldown_active_unique").on(t.prospectId).where(sql`${t.status} = 'active'`), index("prospect_cooldown_expiry_idx").on(t.workspaceId, t.status, t.endsAt), check("prospect_cooldown_range_check", sql`${t.endsAt} > ${t.startsAt}`)]);

export const prospectReentryEvents = sqliteTable("prospect_reentry_events", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), prospectId: text("prospect_id").notNull().references(() => profileProspects.id), cooldownId: text("cooldown_id").references(() => prospectCooldowns.id), signalId: text("signal_id").references(() => prospectingSignals.id), priorAssessmentId: text("prior_assessment_id").references(() => qualificationAssessments.id), eventKind: text("event_kind", { enum: ["review_due", "material_signal", "hard_gate_disproved"] }).notNull(), eventJson: text("event_json").notNull(), eventDigest: text("event_digest").notNull(), authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id), auditEventId: text("audit_event_id").notNull().references(() => auditEvents.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("prospect_reentry_event_digest_unique").on(t.workspaceId, t.eventDigest), index("prospect_reentry_event_prospect_idx").on(t.prospectId, t.createdAt), check("prospect_reentry_event_digest_check", sql`length(${t.eventDigest}) = 64 and ${t.eventDigest} not glob '*[^0-9a-f]*'`)]);

export const csrfTokens = sqliteTable("csrf_tokens", { id: text("id").primaryKey(), principalSubject: text("principal_subject").notNull(), tokenDigest: text("token_digest").notNull().unique(), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), usedAt: integer("used_at", { mode: "timestamp_ms" }), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [index("csrf_principal_expiry_idx").on(t.principalSubject, t.expiresAt, t.usedAt)]);
export const importBatches = sqliteTable("import_batches", { id: text("id").primaryKey(), ...auditColumns, format: text("format").notNull(), formatVersion: text("format_version").notNull(), artifactDigestsJson: text("artifact_digests_json").notNull(), status: text("status", { enum: ["staged", "reviewing", "completed", "rejected"] }).notNull(), countsJson: text("counts_json").notNull() }, (t) => [uniqueIndex("import_identity_unique").on(t.workspaceId, t.format, t.formatVersion, t.artifactDigestsJson)]);
export const importItems = sqliteTable("import_items", { id: text("id").primaryKey(), ...auditColumns, batchId: text("batch_id").notNull(), sourceIndex: integer("source_index").notNull(), itemHash: text("item_hash").notNull(), destinationType: text("destination_type").notNull(), normalizedJson: text("normalized_json").notNull(), reviewState: text("review_state", { enum: ["unreviewed", "resolved", "promoted", "rejected"] }).notNull() }, (t) => [uniqueIndex("import_item_unique").on(t.workspaceId, t.batchId, t.sourceIndex)]);
export const prospects = sqliteTable("prospects", { id: text("id").primaryKey(), ...auditColumns, profileId: text("profile_id").notNull(), organizationName: text("organization_name").notNull(), targetName: text("target_name"), state: text("state").notNull(), score: integer("score"), configurationId: text("configuration_id").notNull() }, (t) => [index("prospect_queue_idx").on(t.workspaceId, t.profileId, t.state)]);
export const suppressions = sqliteTable("suppressions", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), subjectType: text("subject_type").notNull(), subjectDigest: text("subject_digest").notNull(), channel: text("channel").notNull(), reason: text("reason").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("suppression_subject_unique").on(t.workspaceId, t.subjectType, t.subjectDigest, t.channel)]);
export const auditEvents = sqliteTable("audit_events", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull(), actorType: text("actor_type").notNull(), actorId: text("actor_id").notNull(), action: text("action").notNull(), subjectType: text("subject_type").notNull(), subjectId: text("subject_id").notNull(), detailJson: text("detail_json").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [index("audit_workspace_time_idx").on(t.workspaceId, t.createdAt)]);
