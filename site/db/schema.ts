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
export const phaseActivationGates = sqliteTable("phase_activation_gates", { id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), capability: text("capability", { enum: ["consensus_knowledge", "controlled_enrichment"] }).notNull(), authorizationReference: text("authorization_reference").notNull(), targetProjectDeployment: text("target_project_deployment").notNull(), reviewedSourceDigest: text("reviewed_source_digest").notNull(), migrationIdentityStatus: text("migration_identity_status").notNull(), postMigrationEvidenceReference: text("post_migration_evidence_reference").notNull(), independentReviewReference: text("independent_review_reference").notNull(), deployedBoundaryProofReference: text("deployed_boundary_proof_reference").notNull(), tupleDigest: text("tuple_digest").notNull(), acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull() }, (t) => [uniqueIndex("phase_gate_capability_unique").on(t.workspaceId, t.capability), uniqueIndex("phase_gate_tuple_unique").on(t.workspaceId, t.capability, t.tupleDigest)]);

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

// Provider-neutral Phase 5 preparation records. These tables intentionally
// contain no credentials, endpoints, raw provider envelopes, or contact values.
export const providerQuotes = sqliteTable("provider_quotes", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  providerId: text("provider_id").notNull(), providerVersion: text("provider_version").notNull(), catalogRef: text("catalog_ref").notNull(),
  revision: integer("revision").notNull(), operation: text("operation", { enum: ["business_contact_lookup/v1"] }).notNull(),
  currency: text("currency").notNull(), unitCostMinor: integer("unit_cost_minor").notNull(), quoteDigest: text("quote_digest").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("provider_quote_revision_unique").on(t.workspaceId, t.providerId, t.providerVersion, t.catalogRef, t.revision, t.operation),
  uniqueIndex("provider_quote_digest_unique").on(t.workspaceId, t.quoteDigest), index("provider_quote_lookup_idx").on(t.workspaceId, t.operation, t.expiresAt),
  check("provider_quote_revision_check", sql`${t.revision} > 0`), check("provider_quote_currency_check", sql`length(${t.currency}) = 3 and ${t.currency} = upper(${t.currency}) and ${t.currency} not glob '*[^A-Z]*'`),
  check("provider_quote_cost_check", sql`${t.unitCostMinor} >= 0`), check("provider_quote_digest_check", sql`length(${t.quoteDigest}) = 64 and ${t.quoteDigest} not glob '*[^0-9a-f]*'`),
  check("provider_quote_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
]);

export const enrichmentGrants = sqliteTable("enrichment_grants", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  quoteId: text("quote_id").notNull().references(() => providerQuotes.id), configurationId: text("configuration_id").notNull().references(() => configurations.id),
  configurationDigest: text("configuration_digest").notNull(), configurationRevision: integer("configuration_revision").notNull(), sourceRevision: integer("source_revision").notNull(),
  providerId: text("provider_id").notNull(), providerVersion: text("provider_version").notNull(), catalogRef: text("catalog_ref").notNull(),
  quoteRevision: integer("quote_revision").notNull(), quoteUnitCostMinor: integer("quote_unit_cost_minor").notNull(), quoteExpiresAt: integer("quote_expires_at", { mode: "timestamp_ms" }).notNull(),
  operation: text("operation", { enum: ["business_contact_lookup/v1"] }).notNull(), operationKey: text("operation_key").notNull(),
  maxUnits: integer("max_units").notNull(), maxCostMinor: integer("max_cost_minor").notNull(), currency: text("currency").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), ownerSubject: text("owner_subject").notNull(), nonce: text("nonce").notNull(),
  idempotencyKey: text("idempotency_key").notNull(), requestDigest: text("request_digest").notNull(), tupleDigest: text("tuple_digest").notNull(),
  status: text("status", { enum: ["issued"] }).notNull().default("issued"), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("enrichment_grant_idempotency_unique").on(t.workspaceId, t.idempotencyKey), uniqueIndex("enrichment_grant_operation_unique").on(t.workspaceId, t.operationKey),
  uniqueIndex("enrichment_grant_tuple_digest_unique").on(t.workspaceId, t.tupleDigest), index("enrichment_grant_configuration_idx").on(t.workspaceId, t.configurationId, t.createdAt),
  check("enrichment_grant_configuration_revision_check", sql`${t.configurationRevision} > 0 and ${t.sourceRevision} > 0`),
  check("enrichment_grant_configuration_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`),
  check("enrichment_grant_operation_key_check", sql`length(${t.operationKey}) = 67 and substr(${t.operationKey}, 1, 3) = 'op_' and substr(${t.operationKey}, 4) not glob '*[^0-9a-f]*'`),
  check("enrichment_grant_bounds_check", sql`${t.maxUnits} > 0 and ${t.maxUnits} <= 1000 and ${t.maxCostMinor} >= 0 and ${t.quoteUnitCostMinor} >= 0 and ${t.maxCostMinor} >= ${t.quoteUnitCostMinor} * ${t.maxUnits}`),
  check("enrichment_grant_currency_check", sql`length(${t.currency}) = 3 and ${t.currency} = upper(${t.currency}) and ${t.currency} not glob '*[^A-Z]*'`),
  check("enrichment_grant_digest_check", sql`length(${t.requestDigest}) = 64 and ${t.requestDigest} not glob '*[^0-9a-f]*' and length(${t.tupleDigest}) = 64 and ${t.tupleDigest} not glob '*[^0-9a-f]*'`),
  check("enrichment_grant_expiry_check", sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.quoteExpiresAt}`),
]);

export const enrichmentGrantProspects = sqliteTable("enrichment_grant_prospects", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  grantId: text("grant_id").notNull().references(() => enrichmentGrants.id), prospectId: text("prospect_id").notNull().references(() => profileProspects.id),
  ordinal: integer("ordinal").notNull(), prospectRevision: integer("prospect_revision").notNull(), configurationId: text("configuration_id").notNull().references(() => configurations.id),
  configurationDigest: text("configuration_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("enrichment_grant_prospect_unique").on(t.grantId, t.prospectId), uniqueIndex("enrichment_grant_prospect_ordinal_unique").on(t.grantId, t.ordinal),
  index("enrichment_grant_prospect_lookup_idx").on(t.workspaceId, t.prospectId), check("enrichment_grant_prospect_revision_check", sql`${t.ordinal} >= 0 and ${t.prospectRevision} > 0`),
  check("enrichment_grant_prospect_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`),
]);

export const enrichmentGrantIssuanceEvents = sqliteTable("enrichment_grant_issuance_events", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  grantId: text("grant_id").notNull().references(() => enrichmentGrants.id), actorSubject: text("actor_subject").notNull(),
  action: text("action", { enum: ["enrichment.grant.issued"] }).notNull(), operationKey: text("operation_key").notNull(),
  requestDigest: text("request_digest").notNull(), eventDigest: text("event_digest").notNull(), boundedReason: text("bounded_reason", { enum: ["issued"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("enrichment_grant_issuance_grant_unique").on(t.grantId), uniqueIndex("enrichment_grant_issuance_digest_unique").on(t.workspaceId, t.eventDigest),
  check("enrichment_grant_issuance_digest_check", sql`length(${t.requestDigest}) = 64 and ${t.requestDigest} not glob '*[^0-9a-f]*' and length(${t.eventDigest}) = 64 and ${t.eventDigest} not glob '*[^0-9a-f]*'`),
]);

export const enrichmentBudgetAccounts = sqliteTable("enrichment_budget_accounts", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  authorityType: text("authority_type", { enum: ["enrichment"] }).notNull().default("enrichment"), scope: text("scope", { enum: ["grant", "profile", "workspace", "provider"] }).notNull(),
  entityId: text("entity_id").notNull(), currency: text("currency").notNull(), actualUnits: integer("actual_units").notNull().default(0),
  reservedUnits: integer("reserved_units").notNull().default(0), maxUnits: integer("max_units").notNull(), actualCostMinor: integer("actual_cost_minor").notNull().default(0),
  reservedCostMinor: integer("reserved_cost_minor").notNull().default(0), maxCostMinor: integer("max_cost_minor").notNull(), revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("enrichment_budget_account_scope_unique").on(t.workspaceId, t.scope, t.entityId, t.currency),
  check("enrichment_budget_account_currency_check", sql`length(${t.currency}) = 3 and ${t.currency} = upper(${t.currency}) and ${t.currency} not glob '*[^A-Z]*'`),
  check("enrichment_budget_account_bounds_check", sql`${t.actualUnits} >= 0 and ${t.reservedUnits} >= 0 and ${t.maxUnits} >= 0 and ${t.actualUnits} + ${t.reservedUnits} <= ${t.maxUnits} and ${t.actualCostMinor} >= 0 and ${t.reservedCostMinor} >= 0 and ${t.maxCostMinor} >= 0 and ${t.actualCostMinor} + ${t.reservedCostMinor} <= ${t.maxCostMinor} and ${t.revision} > 0`),
]);

export const enrichmentReservations = sqliteTable("enrichment_reservations", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  grantId: text("grant_id").notNull().references(() => enrichmentGrants.id), operationKey: text("operation_key").notNull(),
  assignmentJson: text("assignment_json").notNull(), assignmentDigest: text("assignment_digest").notNull(), reservedUnits: integer("reserved_units").notNull(),
  reservedCostMinor: integer("reserved_cost_minor").notNull(), currency: text("currency").notNull(), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("enrichment_reservation_grant_operation_unique").on(t.workspaceId, t.grantId, t.operationKey),
  uniqueIndex("enrichment_reservation_assignment_digest_unique").on(t.workspaceId, t.assignmentDigest),
  check("enrichment_reservation_assignment_digest_check", sql`length(${t.assignmentDigest}) = 64 and ${t.assignmentDigest} not glob '*[^0-9a-f]*'`),
  check("enrichment_reservation_bounds_check", sql`${t.reservedUnits} > 0 and ${t.reservedCostMinor} >= 0 and ${t.expiresAt} > ${t.createdAt}`),
  check("enrichment_reservation_currency_check", sql`length(${t.currency}) = 3 and ${t.currency} = upper(${t.currency}) and ${t.currency} not glob '*[^A-Z]*'`),
]);

export const enrichmentReservationBudgetEntries = sqliteTable("enrichment_reservation_budget_entries", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  reservationId: text("reservation_id").notNull().references(() => enrichmentReservations.id), accountId: text("account_id").notNull().references(() => enrichmentBudgetAccounts.id),
  reservedUnits: integer("reserved_units").notNull(), reservedCostMinor: integer("reserved_cost_minor").notNull(), accountExpectedRevision: integer("account_expected_revision").notNull(),
  entryDigest: text("entry_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("enrichment_reservation_budget_account_unique").on(t.reservationId, t.accountId), uniqueIndex("enrichment_reservation_budget_entry_digest_unique").on(t.workspaceId, t.entryDigest),
  check("enrichment_reservation_budget_entry_bounds_check", sql`${t.reservedUnits} > 0 and ${t.reservedCostMinor} >= 0 and ${t.accountExpectedRevision} > 0`),
  check("enrichment_reservation_budget_entry_digest_check", sql`length(${t.entryDigest}) = 64 and ${t.entryDigest} not glob '*[^0-9a-f]*'`),
]);

export const enrichmentReservationEvents = sqliteTable("enrichment_reservation_events", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  reservationId: text("reservation_id").notNull().references(() => enrichmentReservations.id), durableRevision: integer("durable_revision").notNull(),
  state: text("state", { enum: ["reserved", "invoking", "settled", "released", "needs_reconciliation"] }).notNull(), terminalReason: text("terminal_reason"),
  settlementDigest: text("settlement_digest"), documentedUnits: integer("documented_units"), documentedCostMinor: integer("documented_cost_minor"),
  observationIdsJson: text("observation_ids_json").notNull().default("[]"),
  acknowledgementDigest: text("acknowledgement_digest").notNull(), claimedAt: integer("claimed_at", { mode: "timestamp_ms" }), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("enrichment_reservation_event_revision_unique").on(t.reservationId, t.durableRevision),
  uniqueIndex("enrichment_reservation_event_ack_unique").on(t.workspaceId, t.acknowledgementDigest), index("enrichment_reservation_event_state_idx").on(t.workspaceId, t.state, t.createdAt),
  check("enrichment_reservation_event_revision_check", sql`${t.durableRevision} > 0`),
  check("enrichment_reservation_event_digest_check", sql`length(${t.acknowledgementDigest}) = 64 and ${t.acknowledgementDigest} not glob '*[^0-9a-f]*' and (${t.settlementDigest} is null or (length(${t.settlementDigest}) = 64 and ${t.settlementDigest} not glob '*[^0-9a-f]*'))`),
]);

export const contactEvidenceAssignments = sqliteTable("contact_evidence_assignments", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  reservationId: text("reservation_id").references(() => enrichmentReservations.id), grantId: text("grant_id").notNull().references(() => enrichmentGrants.id),
  prospectId: text("prospect_id").notNull().references(() => profileProspects.id), contactId: text("contact_id").notNull().references(() => contacts.id),
  role: text("role", { enum: ["champion", "economic_buyer", "general"] }).notNull(), configurationId: text("configuration_id").notNull().references(() => configurations.id),
  configurationDigest: text("configuration_digest").notNull(), providerId: text("provider_id").notNull(), providerVersion: text("provider_version").notNull(),
  catalogRef: text("catalog_ref").notNull(), quoteRevision: integer("quote_revision").notNull(), assignmentDigest: text("assignment_digest").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("contact_evidence_assignment_digest_unique").on(t.workspaceId, t.assignmentDigest),
  index("contact_evidence_assignment_prospect_idx").on(t.workspaceId, t.prospectId, t.role),
  check("contact_evidence_assignment_configuration_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`),
  check("contact_evidence_assignment_digest_check", sql`length(${t.assignmentDigest}) = 64 and ${t.assignmentDigest} not glob '*[^0-9a-f]*'`),
]);

export const contactVerificationReceipts = sqliteTable("contact_verification_receipts", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  reservationId: text("reservation_id").notNull().references(() => enrichmentReservations.id),
  grantId: text("grant_id").notNull().references(() => enrichmentGrants.id),
  assignmentId: text("assignment_id").notNull().references(() => contactEvidenceAssignments.id),
  prospectId: text("prospect_id").notNull().references(() => profileProspects.id),
  contactId: text("contact_id").notNull().references(() => contacts.id),
  role: text("role", { enum: ["champion", "economic_buyer", "general"] }).notNull(),
  configurationId: text("configuration_id").notNull().references(() => configurations.id),
  configurationDigest: text("configuration_digest").notNull(),
  providerId: text("provider_id").notNull(), providerVersion: text("provider_version").notNull(),
  catalogRef: text("catalog_ref").notNull(), quoteRevision: integer("quote_revision").notNull(),
  verifierId: text("verifier_id").notNull(), verifierVersion: text("verifier_version").notNull(),
  requestDigest: text("request_digest").notNull(), verdictReference: text("verdict_reference").notNull(),
  verdictDigest: text("verdict_digest").notNull(), observationId: text("observation_id").notNull(),
  kind: text("kind", { enum: ["email", "phone"] }).notNull(),
  contactPointDigest: text("contact_point_digest").notNull(),
  verificationClass: text("verification_class", { enum: ["suggested", "domain_valid", "mailbox_verified", "source_verified", "invalid"] }).notNull(),
  method: text("method", { enum: ["pattern_inference", "domain_validation", "mailbox_verification", "authoritative_source_reconfirmed"] }).notNull(),
  retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  contentHash: text("content_hash").notNull(), receiptDigest: text("receipt_digest").notNull(),
  attestationKeyId: text("attestation_key_id"),
  settlementMaterialDigest: text("settlement_material_digest"),
  settlementAttestationTag: text("settlement_attestation_tag"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("contact_verification_receipt_request_unique").on(t.workspaceId, t.reservationId, t.assignmentId, t.requestDigest),
  uniqueIndex("contact_verification_receipt_observation_unique").on(t.workspaceId, t.observationId),
  uniqueIndex("contact_verification_receipt_digest_unique").on(t.workspaceId, t.receiptDigest),
  uniqueIndex("contact_verification_receipt_verdict_unique").on(t.workspaceId, t.verifierId, t.verifierVersion, t.verdictDigest),
  index("contact_verification_receipt_attestation_idx").on(t.workspaceId, t.attestationKeyId, t.createdAt),
  check("contact_verification_receipt_time_check", sql`${t.retrievedAt} <= ${t.observedAt} and (${t.verifiedAt} is null or (${t.verifiedAt} >= ${t.retrievedAt} and ${t.verifiedAt} <= ${t.observedAt}))`),
  check("contact_verification_receipt_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*' and length(${t.requestDigest}) = 64 and ${t.requestDigest} not glob '*[^0-9a-f]*' and length(${t.verdictDigest}) = 64 and ${t.verdictDigest} not glob '*[^0-9a-f]*' and length(${t.contactPointDigest}) = 64 and ${t.contactPointDigest} not glob '*[^0-9a-f]*' and length(${t.contentHash}) = 64 and ${t.contentHash} not glob '*[^0-9a-f]*' and length(${t.receiptDigest}) = 64 and ${t.receiptDigest} not glob '*[^0-9a-f]*'`),
  check("contact_verification_receipt_attestation_shape_check", sql`((${t.attestationKeyId} is null and ${t.settlementMaterialDigest} is null and ${t.settlementAttestationTag} is null) or (${t.attestationKeyId} is not null and length(${t.attestationKeyId}) between 1 and 128 and ${t.settlementMaterialDigest} is not null and length(${t.settlementMaterialDigest}) = 64 and ${t.settlementMaterialDigest} not glob '*[^0-9a-f]*' and ${t.settlementAttestationTag} is not null and length(${t.settlementAttestationTag}) = 64 and ${t.settlementAttestationTag} not glob '*[^0-9a-f]*'))`),
  check("contact_verification_receipt_verified_attestation_check", sql`${t.verificationClass} not in ('mailbox_verified','source_verified') or ${t.attestationKeyId} is not null`),
]);

export const contactPointObservations = sqliteTable("contact_point_observations", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  assignmentId: text("assignment_id").notNull().references(() => contactEvidenceAssignments.id), contactId: text("contact_id").notNull().references(() => contacts.id),
  configurationId: text("configuration_id").notNull().references(() => configurations.id), configurationDigest: text("configuration_digest").notNull(),
  kind: text("kind", { enum: ["email", "phone"] }).notNull(), contactPointDigest: text("contact_point_digest").notNull(),
  contactPointReference: text("contact_point_reference").notNull(), verificationClass: text("verification_class", { enum: ["suggested", "domain_valid", "mailbox_verified", "source_verified", "invalid"] }).notNull(),
  confidenceBasisPoints: integer("confidence_basis_points").notNull(), method: text("method", { enum: ["pattern_inference", "domain_validation", "mailbox_verification", "authoritative_source_reconfirmed"] }).notNull(),
  sourceReference: text("source_reference").notNull(), excerptDigest: text("excerpt_digest").notNull(), objectReference: text("object_reference").notNull(),
  contentHash: text("content_hash").notNull(), retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(),
  observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(), verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
  providerId: text("provider_id"), providerVersion: text("provider_version"), catalogRef: text("catalog_ref"),
  verifierId: text("verifier_id"), verifierVersion: text("verifier_version"), verdictReference: text("verdict_reference"), verdictDigest: text("verdict_digest"),
  verificationReceiptId: text("verification_receipt_id").references(() => contactVerificationReceipts.id),
  parentObservationId: text("parent_observation_id"), observationDigest: text("observation_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("contact_point_observation_digest_unique").on(t.workspaceId, t.observationDigest), index("contact_point_observation_contact_idx").on(t.workspaceId, t.contactId, t.observedAt),
  check("contact_point_observation_confidence_check", sql`${t.confidenceBasisPoints} >= 0 and ${t.confidenceBasisPoints} <= 10000`),
  check("contact_point_observation_time_check", sql`${t.retrievedAt} <= ${t.observedAt} and (${t.verifiedAt} is null or (${t.verifiedAt} >= ${t.retrievedAt} and ${t.verifiedAt} <= ${t.observedAt}))`),
  check("contact_point_observation_digest_check", sql`length(${t.contactPointDigest}) = 64 and ${t.contactPointDigest} not glob '*[^0-9a-f]*' and length(${t.excerptDigest}) = 64 and ${t.excerptDigest} not glob '*[^0-9a-f]*' and length(${t.contentHash}) = 64 and ${t.contentHash} not glob '*[^0-9a-f]*' and length(${t.observationDigest}) = 64 and ${t.observationDigest} not glob '*[^0-9a-f]*' and (${t.verdictDigest} is null or (length(${t.verdictDigest}) = 64 and ${t.verdictDigest} not glob '*[^0-9a-f]*'))`),
]);

export const contactEligibilitySnapshots = sqliteTable("contact_eligibility_snapshots", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  contactId: text("contact_id").notNull().references(() => contacts.id), prospectId: text("prospect_id").notNull().references(() => profileProspects.id),
  configurationId: text("configuration_id").notNull().references(() => configurations.id),
  configurationDigest: text("configuration_digest").notNull(), configurationRevision: integer("configuration_revision").notNull(),
  prospectRevision: integer("prospect_revision").notNull(),
  state: text("state", { enum: ["ContactReady", "ContactSuggestion", "NeedsReview", "NonContactable"] }).notNull(),
  eligible: integer("eligible", { mode: "boolean" }).notNull(), observationIdsJson: text("observation_ids_json").notNull(),
  reasonCodesJson: text("reason_codes_json").notNull(), preservedSuppressionRefsJson: text("preserved_suppression_refs_json").notNull().default("[]"),
  snapshotDigest: text("snapshot_digest").notNull(), projectedAt: integer("projected_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("contact_eligibility_snapshot_digest_unique").on(t.workspaceId, t.snapshotDigest),
  index("contact_eligibility_snapshot_current_idx").on(t.workspaceId, t.prospectId, t.contactId, t.projectedAt),
  check("contact_eligibility_snapshot_digest_check", sql`length(${t.snapshotDigest}) = 64 and ${t.snapshotDigest} not glob '*[^0-9a-f]*' and length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*'`),
  check("contact_eligibility_snapshot_revision_check", sql`${t.configurationRevision} > 0 and ${t.prospectRevision} > 0`),
]);

export const identitySuggestions = sqliteTable("identity_suggestions", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  ownerSubject: text("owner_subject").notNull(), subjectKind: text("subject_kind", { enum: ["contact", "organization"] }).notNull(),
  kind: text("kind", { enum: ["merge", "split"] }).notNull(), revision: integer("revision").notNull(),
  candidateRevisionsJson: text("candidate_revisions_json").notNull(), sourceLineageIdsJson: text("source_lineage_ids_json").notNull(),
  retainedIdentityLineageIdsJson: text("retained_identity_lineage_ids_json").notNull(), retainedAliasesJson: text("retained_aliases_json").notNull(),
  retainedSuppressionSubjectRefsJson: text("retained_suppression_subject_refs_json").notNull(), proposedPartitionJson: text("proposed_partition_json"),
  suggestionDigest: text("suggestion_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("identity_suggestion_digest_unique").on(t.workspaceId, t.suggestionDigest), index("identity_suggestion_owner_idx").on(t.workspaceId, t.ownerSubject, t.createdAt),
  check("identity_suggestion_revision_check", sql`${t.revision} > 0`), check("identity_suggestion_digest_check", sql`length(${t.suggestionDigest}) = 64 and ${t.suggestionDigest} not glob '*[^0-9a-f]*'`),
]);

export const identitySuggestionCandidates = sqliteTable("identity_suggestion_candidates", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  suggestionId: text("suggestion_id").notNull().references(() => identitySuggestions.id), subjectId: text("subject_id").notNull(),
  candidateRevision: integer("candidate_revision").notNull(), ordinal: integer("ordinal").notNull(),
}, (t) => [
  uniqueIndex("identity_suggestion_candidate_unique").on(t.suggestionId, t.subjectId), uniqueIndex("identity_suggestion_candidate_ordinal_unique").on(t.suggestionId, t.ordinal),
  check("identity_suggestion_candidate_revision_check", sql`${t.candidateRevision} > 0 and ${t.ordinal} >= 0`),
]);

export const identitySuggestionImpacts = sqliteTable("identity_suggestion_impacts", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  suggestionId: text("suggestion_id").notNull().references(() => identitySuggestions.id), associationId: text("association_id").notNull(),
  scope: text("scope", { enum: ["market_play", "customer_profile"] }).notNull(), relevanceId: text("relevance_id").notNull(),
  subjectId: text("subject_id").notNull(), impactDigest: text("impact_digest").notNull(),
}, (t) => [
  uniqueIndex("identity_suggestion_impact_association_unique").on(t.suggestionId, t.associationId), uniqueIndex("identity_suggestion_impact_digest_unique").on(t.workspaceId, t.impactDigest),
  check("identity_suggestion_impact_digest_check", sql`length(${t.impactDigest}) = 64 and ${t.impactDigest} not glob '*[^0-9a-f]*'`),
]);

export const identityDecisions = sqliteTable("identity_decisions", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  suggestionId: text("suggestion_id").notNull().references(() => identitySuggestions.id), ownerSubject: text("owner_subject").notNull(),
  subjectKind: text("subject_kind", { enum: ["contact", "organization"] }).notNull(), kind: text("kind", { enum: ["merge", "split"] }).notNull(),
  decisionJson: text("decision_json").notNull(), idempotencyKey: text("idempotency_key").notNull(), operationDigest: text("operation_digest").notNull(),
  resultDigest: text("result_digest").notNull(), retainedSourceLineageIdsJson: text("retained_source_lineage_ids_json").notNull(),
  retainedIdentityLineageIdsJson: text("retained_identity_lineage_ids_json").notNull(), retainedAliasesJson: text("retained_aliases_json").notNull(),
  retainedSuppressionSubjectRefsJson: text("retained_suppression_subject_refs_json").notNull(), rePointedAssociationIdsJson: text("repointed_association_ids_json").notNull(),
  invalidationsJson: text("invalidations_json").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("identity_decision_suggestion_unique").on(t.suggestionId), uniqueIndex("identity_decision_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
  uniqueIndex("identity_decision_operation_unique").on(t.workspaceId, t.operationDigest),
  check("identity_decision_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*' and length(${t.resultDigest}) = 64 and ${t.resultDigest} not glob '*[^0-9a-f]*'`),
]);

export const identityLineage = sqliteTable("identity_lineage", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  decisionId: text("decision_id").notNull().references(() => identityDecisions.id), subjectKind: text("subject_kind", { enum: ["contact", "organization"] }).notNull(),
  sourceSubjectId: text("source_subject_id").notNull(), targetSubjectId: text("target_subject_id").notNull(),
  relationship: text("relationship", { enum: ["merged_into", "split_from", "association_repointed"] }).notNull(),
  retainedSourceLineageIdsJson: text("retained_source_lineage_ids_json").notNull(), retainedIdentityLineageIdsJson: text("retained_identity_lineage_ids_json").notNull(),
  retainedAliasesJson: text("retained_aliases_json").notNull(), retainedSuppressionSubjectRefsJson: text("retained_suppression_subject_refs_json").notNull(),
  lineageDigest: text("lineage_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("identity_lineage_digest_unique").on(t.workspaceId, t.lineageDigest), index("identity_lineage_source_idx").on(t.workspaceId, t.sourceSubjectId, t.createdAt),
  index("identity_lineage_target_idx").on(t.workspaceId, t.targetSubjectId, t.createdAt),
  check("identity_lineage_digest_check", sql`length(${t.lineageDigest}) = 64 and ${t.lineageDigest} not glob '*[^0-9a-f]*'`),
]);

export const runnerSpendGrants = sqliteTable("runner_spend_grants", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  ownerSubject: text("owner_subject").notNull(), providerId: text("provider_id").notNull(), model: text("model").notNull(),
  catalogRef: text("catalog_ref").notNull(), runType: text("run_type").notNull(), scopeId: text("scope_id").notNull(),
  perRunCostMinor: integer("per_run_cost_minor").notNull(), monthlyCostMinor: integer("monthly_cost_minor").notNull(),
  currency: text("currency").notNull(), maxRetries: integer("max_retries").notNull(),
  sourceRevision: integer("source_revision").notNull(), idempotencyKey: text("idempotency_key").notNull(),
  requestDigest: text("request_digest").notNull(), grantDigest: text("grant_digest").notNull(),
  authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id),
  auditEventId: text("audit_event_id").notNull().references(() => auditEvents.id),
  nonce: text("nonce").notNull(), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("runner_spend_grant_digest_unique").on(t.workspaceId, t.grantDigest),
  uniqueIndex("runner_spend_grant_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
  uniqueIndex("runner_spend_grant_request_unique").on(t.workspaceId, t.requestDigest),
  index("runner_spend_grant_owner_idx").on(t.workspaceId, t.ownerSubject, t.expiresAt),
  check("runner_spend_grant_bounds_check", sql`${t.perRunCostMinor} >= 0 and ${t.monthlyCostMinor} >= ${t.perRunCostMinor} and ${t.maxRetries} >= 0 and ${t.maxRetries} <= 3 and ${t.sourceRevision} > 0 and ${t.expiresAt} > ${t.createdAt}`),
  check("runner_spend_grant_currency_check", sql`length(${t.currency}) = 3 and ${t.currency} = upper(${t.currency}) and ${t.currency} not glob '*[^A-Z]*'`),
  check("runner_spend_grant_digest_check", sql`length(${t.requestDigest}) = 64 and ${t.requestDigest} not glob '*[^0-9a-f]*' and length(${t.grantDigest}) = 64 and ${t.grantDigest} not glob '*[^0-9a-f]*'`),
]);

export const runnerBudgetAccounts = sqliteTable("runner_budget_accounts", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  scope: text("scope", { enum: ["runner_per_run", "runner_monthly"] }).notNull(), ownerSubject: text("owner_subject").notNull(),
  providerId: text("provider_id").notNull(), scopeId: text("scope_id").notNull(), period: text("period"),
  attemptNumber: integer("attempt_number"), operationKey: text("operation_key"), currency: text("currency").notNull(),
  actualCostMinor: integer("actual_cost_minor").notNull().default(0), reservedCostMinor: integer("reserved_cost_minor").notNull().default(0),
  maxCostMinor: integer("max_cost_minor").notNull(), revision: integer("revision").notNull().default(1),
  createdByGrantId: text("created_by_grant_id").notNull().references(() => runnerSpendGrants.id),
  authorityCommandId: text("authority_command_id").notNull().references(() => authorityCommands.id),
  auditEventId: text("audit_event_id").notNull().references(() => auditEvents.id),
  accountDigest: text("account_digest").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(), updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  // Monthly identity intentionally excludes grant and model: all grants for the
  // same owner/provider/scope/UTC month share one durable cap.
  uniqueIndex("runner_budget_account_identity_unique").on(t.workspaceId, t.scope, t.ownerSubject, t.providerId, t.scopeId, t.period, t.attemptNumber, t.operationKey, t.currency),
  index("runner_budget_account_month_idx").on(t.workspaceId, t.ownerSubject, t.providerId, t.scopeId, t.period),
  check("runner_budget_account_shape_check", sql`(${t.scope} = 'runner_monthly' and ${t.period} glob '[0-9][0-9][0-9][0-9]-[0-1][0-9]' and ${t.attemptNumber} is null and ${t.operationKey} is null) or (${t.scope} = 'runner_per_run' and ${t.period} is null and ${t.attemptNumber} >= 0 and ${t.operationKey} is not null)`),
  check("runner_budget_account_currency_check", sql`length(${t.currency}) = 3 and ${t.currency} = upper(${t.currency}) and ${t.currency} not glob '*[^A-Z]*'`),
  check("runner_budget_account_bounds_check", sql`${t.actualCostMinor} >= 0 and ${t.reservedCostMinor} >= 0 and ${t.maxCostMinor} >= 0 and ${t.actualCostMinor} + ${t.reservedCostMinor} <= ${t.maxCostMinor} and ${t.revision} > 0`),
  check("runner_budget_account_digest_check", sql`length(${t.accountDigest}) = 64 and ${t.accountDigest} not glob '*[^0-9a-f]*'`),
]);

export const runnerSpendReservations = sqliteTable("runner_spend_reservations", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  grantId: text("grant_id").notNull().references(() => runnerSpendGrants.id), perRunAccountId: text("per_run_account_id").notNull().references(() => runnerBudgetAccounts.id),
  monthlyAccountId: text("monthly_account_id").notNull().references(() => runnerBudgetAccounts.id), operationKey: text("operation_key").notNull(),
  attemptNumber: integer("attempt_number").notNull(), period: text("period").notNull(),
  previousOutcome: text("previous_outcome", { enum: ["none", "failed_retryable"] }).notNull(),
  previousOperationKeysJson: text("previous_operation_keys_json").notNull(),
  perRunAccountExpectedRevision: integer("per_run_account_expected_revision").notNull(),
  monthlyAccountExpectedRevision: integer("monthly_account_expected_revision").notNull(),
  providerId: text("provider_id").notNull(), model: text("model").notNull(),
  catalogRef: text("catalog_ref").notNull(), scopeId: text("scope_id").notNull(), runType: text("run_type").notNull(),
  currency: text("currency").notNull(), reservedCostMinor: integer("reserved_cost_minor").notNull(), maxRetries: integer("max_retries").notNull(),
  attemptDigest: text("attempt_digest").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("runner_spend_reservation_attempt_unique").on(t.workspaceId, t.grantId, t.attemptNumber),
  uniqueIndex("runner_spend_reservation_operation_unique").on(t.workspaceId, t.operationKey), uniqueIndex("runner_spend_reservation_attempt_digest_unique").on(t.workspaceId, t.grantId, t.attemptDigest),
  check("runner_spend_reservation_bounds_check", sql`${t.attemptNumber} >= 0 and ${t.reservedCostMinor} >= 0 and ${t.maxRetries} >= ${t.attemptNumber} and ${t.perRunAccountExpectedRevision} > 0 and ${t.monthlyAccountExpectedRevision} > 0`),
  check("runner_spend_reservation_currency_check", sql`length(${t.currency}) = 3 and ${t.currency} = upper(${t.currency}) and ${t.currency} not glob '*[^A-Z]*'`),
  check("runner_spend_reservation_digest_check", sql`length(${t.attemptDigest}) = 64 and ${t.attemptDigest} not glob '*[^0-9a-f]*'`),
]);

export const runnerSpendReservationEvents = sqliteTable("runner_spend_reservation_events", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  reservationId: text("reservation_id").notNull().references(() => runnerSpendReservations.id), durableRevision: integer("durable_revision").notNull(),
  state: text("state", { enum: ["reserved", "assigned", "failed_retryable", "settled", "released", "needs_reconciliation"] }).notNull(),
  terminalReason: text("terminal_reason"), settlementDigest: text("settlement_digest"), documentedCostMinor: integer("documented_cost_minor"),
  acknowledgementDigest: text("acknowledgement_digest").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("runner_spend_reservation_event_revision_unique").on(t.reservationId, t.durableRevision),
  uniqueIndex("runner_spend_reservation_event_ack_unique").on(t.workspaceId, t.acknowledgementDigest),
  check("runner_spend_reservation_event_revision_check", sql`${t.durableRevision} > 0`),
  check("runner_spend_reservation_event_digest_check", sql`length(${t.acknowledgementDigest}) = 64 and ${t.acknowledgementDigest} not glob '*[^0-9a-f]*' and (${t.settlementDigest} is null or (length(${t.settlementDigest}) = 64 and ${t.settlementDigest} not glob '*[^0-9a-f]*'))`),
]);

// Phase 6 candidate persistence only. These records provide immutable,
// provider-neutral authority facts; no route, worker, adapter, or effect is
// composed from them by this schema.
export const outreachCommands = sqliteTable("outreach_commands", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  ownerSubject: text("owner_subject").notNull(),
  commandKind: text("command_kind", { enum: ["package_version.create", "message_version.create", "package.approve", "message.approve", "suppression.record"] }).notNull(),
  idempotencyKey: text("idempotency_key").notNull(), operationDigest: text("operation_digest").notNull(),
  expectedVersion: integer("expected_version").notNull(), resultKind: text("result_kind", { enum: ["package_version", "message_version", "package_approval", "message_approval", "suppression_tombstone"] }).notNull(),
  resultId: text("result_id").notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_command_idempotency_unique").on(t.workspaceId, t.idempotencyKey),
  uniqueIndex("outreach_command_operation_unique").on(t.workspaceId, t.operationDigest),
  check("outreach_command_expected_version_check", sql`${t.expectedVersion} >= 0`),
  check("outreach_command_digest_check", sql`length(${t.operationDigest}) = 64 and ${t.operationDigest} not glob '*[^0-9a-f]*'`),
]);

export const outreachPackages = sqliteTable("outreach_packages", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  prospectId: text("prospect_id").notNull().references(() => profileProspects.id), contactId: text("contact_id").notNull().references(() => contacts.id),
  profileId: text("profile_id").notNull().references(() => profiles.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("outreach_package_subject_idx").on(t.workspaceId, t.prospectId, t.contactId)]);

export const outreachPackageVersions = sqliteTable("outreach_package_versions", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  packageId: text("package_id").notNull().references(() => outreachPackages.id), version: integer("version").notNull(),
  configurationId: text("configuration_id").notNull().references(() => configurations.id), configurationDigest: text("configuration_digest").notNull(),
  configurationRevision: integer("configuration_revision").notNull(), prospectRevision: integer("prospect_revision").notNull(), contactRevision: integer("contact_revision").notNull(),
  contactEligibilitySnapshotId: text("contact_eligibility_snapshot_id").notNull().references(() => contactEligibilitySnapshots.id),
  snapshotJson: text("snapshot_json").notNull(), artifactDigest: text("artifact_digest").notNull(), callScriptDigest: text("call_script_digest").notNull(),
  commandId: text("command_id").notNull().references(() => outreachCommands.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_package_version_number_unique").on(t.packageId, t.version), uniqueIndex("outreach_package_version_digest_unique").on(t.workspaceId, t.artifactDigest),
  uniqueIndex("outreach_package_version_command_unique").on(t.commandId), index("outreach_package_version_package_idx").on(t.workspaceId, t.packageId, t.version),
  check("outreach_package_version_revision_check", sql`${t.version} > 0 and ${t.configurationRevision} > 0 and ${t.prospectRevision} > 0 and ${t.contactRevision} > 0`),
  check("outreach_package_version_digest_check", sql`length(${t.configurationDigest}) = 64 and ${t.configurationDigest} not glob '*[^0-9a-f]*' and length(${t.artifactDigest}) = 64 and ${t.artifactDigest} not glob '*[^0-9a-f]*' and length(${t.callScriptDigest}) = 64 and ${t.callScriptDigest} not glob '*[^0-9a-f]*'`),
]);

export const outreachMessages = sqliteTable("outreach_messages", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  packageId: text("package_id").notNull().references(() => outreachPackages.id), channel: text("channel", { enum: ["email"] }).notNull().default("email"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("outreach_message_package_idx").on(t.workspaceId, t.packageId)]);

export const outreachMessageVersions = sqliteTable("outreach_message_versions", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  messageId: text("message_id").notNull().references(() => outreachMessages.id), packageVersionId: text("package_version_id").notNull().references(() => outreachPackageVersions.id),
  version: integer("version").notNull(), snapshotJson: text("snapshot_json").notNull(), artifactDigest: text("artifact_digest").notNull(),
  intendedSendAt: integer("intended_send_at", { mode: "timestamp_ms" }), timezone: text("timezone").notNull(), unsubscribeTokenDigest: text("unsubscribe_token_digest").notNull(),
  commandId: text("command_id").notNull().references(() => outreachCommands.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_message_version_number_unique").on(t.messageId, t.version), uniqueIndex("outreach_message_version_digest_unique").on(t.workspaceId, t.artifactDigest),
  uniqueIndex("outreach_message_version_unsubscribe_unique").on(t.workspaceId, t.unsubscribeTokenDigest), uniqueIndex("outreach_message_version_command_unique").on(t.commandId),
  index("outreach_message_version_message_idx").on(t.workspaceId, t.messageId, t.version), check("outreach_message_version_number_check", sql`${t.version} > 0`),
  check("outreach_message_version_digest_check", sql`length(${t.artifactDigest}) = 64 and ${t.artifactDigest} not glob '*[^0-9a-f]*' and length(${t.unsubscribeTokenDigest}) = 64 and ${t.unsubscribeTokenDigest} not glob '*[^0-9a-f]*'`),
]);

export const outreachArtifactBindings = sqliteTable("outreach_artifact_bindings", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  artifactKind: text("artifact_kind", { enum: ["package_version", "message_version"] }).notNull(), artifactId: text("artifact_id").notNull(),
  bindingKind: text("binding_kind", { enum: ["configuration", "qualification", "review_decision", "source", "evidence", "claim_guardrail", "contact_observation", "contact_eligibility", "package_version"] }).notNull(),
  bindingId: text("binding_id").notNull(), bindingDigest: text("binding_digest").notNull(), ordinal: integer("ordinal").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_artifact_binding_ordinal_unique").on(t.artifactKind, t.artifactId, t.ordinal),
  uniqueIndex("outreach_artifact_binding_identity_unique").on(t.artifactKind, t.artifactId, t.bindingKind, t.bindingId),
  index("outreach_artifact_binding_lookup_idx").on(t.workspaceId, t.artifactKind, t.artifactId),
  check("outreach_artifact_binding_ordinal_check", sql`${t.ordinal} >= 0`),
  check("outreach_artifact_binding_digest_check", sql`length(${t.bindingDigest}) = 64 and ${t.bindingDigest} not glob '*[^0-9a-f]*'`),
]);

export const outreachPackageApprovals = sqliteTable("outreach_package_approvals", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  packageVersionId: text("package_version_id").notNull().references(() => outreachPackageVersions.id), artifactDigest: text("artifact_digest").notNull(),
  ownerSubject: text("owner_subject").notNull(), approvalDigest: text("approval_digest").notNull(), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  commandId: text("command_id").notNull().references(() => outreachCommands.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_package_approval_version_unique").on(t.packageVersionId), uniqueIndex("outreach_package_approval_digest_unique").on(t.workspaceId, t.approvalDigest),
  uniqueIndex("outreach_package_approval_command_unique").on(t.commandId), check("outreach_package_approval_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
  check("outreach_package_approval_digest_check", sql`length(${t.artifactDigest}) = 64 and ${t.artifactDigest} not glob '*[^0-9a-f]*' and length(${t.approvalDigest}) = 64 and ${t.approvalDigest} not glob '*[^0-9a-f]*'`),
]);

export const outreachMessageApprovals = sqliteTable("outreach_message_approvals", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  messageVersionId: text("message_version_id").notNull().references(() => outreachMessageVersions.id), packageApprovalId: text("package_approval_id").notNull().references(() => outreachPackageApprovals.id),
  artifactDigest: text("artifact_digest").notNull(), ownerSubject: text("owner_subject").notNull(), acknowledgementDigest: text("acknowledgement_digest").notNull(),
  approvalDigest: text("approval_digest").notNull(), expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  commandId: text("command_id").notNull().references(() => outreachCommands.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_message_approval_version_unique").on(t.messageVersionId), uniqueIndex("outreach_message_approval_digest_unique").on(t.workspaceId, t.approvalDigest),
  uniqueIndex("outreach_message_approval_command_unique").on(t.commandId), check("outreach_message_approval_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
  check("outreach_message_approval_digest_check", sql`length(${t.artifactDigest}) = 64 and ${t.artifactDigest} not glob '*[^0-9a-f]*' and length(${t.acknowledgementDigest}) = 64 and ${t.acknowledgementDigest} not glob '*[^0-9a-f]*' and length(${t.approvalDigest}) = 64 and ${t.approvalDigest} not glob '*[^0-9a-f]*'`),
]);

export const outreachMessageApprovalConsumptions = sqliteTable("outreach_message_approval_consumptions", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  messageApprovalId: text("message_approval_id").notNull().references(() => outreachMessageApprovals.id), sendKey: text("send_key").notNull(),
  approvalDigest: text("approval_digest").notNull(), fenceGeneration: integer("fence_generation").notNull(), consumedAt: integer("consumed_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_message_approval_consumption_once_unique").on(t.messageApprovalId), uniqueIndex("outreach_message_approval_consumption_send_key_unique").on(t.workspaceId, t.sendKey),
  check("outreach_message_approval_consumption_fence_check", sql`${t.fenceGeneration} > 0`),
  check("outreach_message_approval_consumption_digest_check", sql`length(${t.approvalDigest}) = 64 and ${t.approvalDigest} not glob '*[^0-9a-f]*'`),
]);

export const outreachSuppressionTombstones = sqliteTable("outreach_suppression_tombstones", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  subjectKind: text("subject_kind", { enum: ["exact_email", "confirmed_email_domain", "e164_phone", "contact", "organization", "company"] }).notNull(),
  subjectDigest: text("subject_digest").notNull(), channel: text("channel", { enum: ["email", "phone", "all"] }).notNull(),
  reason: text("reason", { enum: ["owner_request", "unsubscribe", "explicit_opt_out", "do_not_call", "identity_retention", "import_retention"] }).notNull(),
  sourceEventDigest: text("source_event_digest").notNull(), aliasSnapshotJson: text("alias_snapshot_json").notNull(), aliasSnapshotDigest: text("alias_snapshot_digest").notNull(),
  tombstoneDigest: text("tombstone_digest").notNull(), actorSubject: text("actor_subject").notNull(), effectiveAt: integer("effective_at", { mode: "timestamp_ms" }).notNull(),
  commandId: text("command_id").notNull().references(() => outreachCommands.id), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_suppression_subject_unique").on(t.workspaceId, t.subjectKind, t.subjectDigest, t.channel),
  uniqueIndex("outreach_suppression_tombstone_digest_unique").on(t.workspaceId, t.tombstoneDigest), uniqueIndex("outreach_suppression_command_unique").on(t.commandId),
  index("outreach_suppression_effective_idx").on(t.workspaceId, t.effectiveAt),
  check("outreach_suppression_time_check", sql`${t.effectiveAt} <= ${t.createdAt}`),
  check("outreach_suppression_digest_check", sql`length(${t.subjectDigest}) = 64 and ${t.subjectDigest} not glob '*[^0-9a-f]*' and length(${t.sourceEventDigest}) = 64 and ${t.sourceEventDigest} not glob '*[^0-9a-f]*' and length(${t.aliasSnapshotDigest}) = 64 and ${t.aliasSnapshotDigest} not glob '*[^0-9a-f]*' and length(${t.tombstoneDigest}) = 64 and ${t.tombstoneDigest} not glob '*[^0-9a-f]*'`),
]);

export const outreachStopEvents = sqliteTable("outreach_stop_events", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  stopKind: text("stop_kind", { enum: ["suppression", "reply", "bounce", "pause", "archive", "high_risk_drift"] }).notNull(),
  tombstoneId: text("tombstone_id").references(() => outreachSuppressionTombstones.id), subjectKind: text("subject_kind").notNull(), subjectDigest: text("subject_digest").notNull(),
  sourceEventDigest: text("source_event_digest").notNull(), reasonCode: text("reason_code").notNull(), commandId: text("command_id").notNull().references(() => outreachCommands.id),
  effectiveAt: integer("effective_at", { mode: "timestamp_ms" }).notNull(), createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_stop_source_unique").on(t.workspaceId, t.stopKind, t.sourceEventDigest), index("outreach_stop_subject_idx").on(t.workspaceId, t.subjectKind, t.subjectDigest, t.effectiveAt),
  check("outreach_stop_time_check", sql`${t.effectiveAt} <= ${t.createdAt}`),
  check("outreach_stop_digest_check", sql`length(${t.subjectDigest}) = 64 and ${t.subjectDigest} not glob '*[^0-9a-f]*' and length(${t.sourceEventDigest}) = 64 and ${t.sourceEventDigest} not glob '*[^0-9a-f]*'`),
]);

export const outreachAuditRecords = sqliteTable("outreach_audit_records", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  actorSubject: text("actor_subject").notNull(), action: text("action", { enum: ["package.version.created", "message.version.created", "package.approved", "message.approved", "suppression.recorded"] }).notNull(),
  subjectKind: text("subject_kind", { enum: ["package_version", "message_version", "package_approval", "message_approval", "suppression_tombstone"] }).notNull(),
  subjectId: text("subject_id").notNull(), outcome: text("outcome", { enum: ["recorded"] }).notNull().default("recorded"), reasonCode: text("reason_code").notNull(),
  materialDigest: text("material_digest").notNull(), commandId: text("command_id").notNull().references(() => outreachCommands.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [
  uniqueIndex("outreach_audit_command_unique").on(t.commandId), uniqueIndex("outreach_audit_material_unique").on(t.workspaceId, t.materialDigest),
  index("outreach_audit_time_idx").on(t.workspaceId, t.createdAt),
  check("outreach_audit_digest_check", sql`length(${t.materialDigest}) = 64 and ${t.materialDigest} not glob '*[^0-9a-f]*'`),
]);
