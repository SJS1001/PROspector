// Canonical zero-effect inventory for the disposable local browser-acceptance
// database. Every table the checked `drizzle/*.sql` chain can create is classified
// exactly once. EFFECT tables must always be empty; LOCAL_STATE tables may hold the
// bounded synthetic onboarding rows. Any table, view, or trigger that is present but
// not named here is unknown, and unknown objects fail verification, so a later
// migration cannot silently add an unverified effect surface to this lane.
//
// `tests/zero-effects-verifier.test.mjs` proves this inventory is exactly the set of
// objects the migration chain creates, so adding a migration fails that parity test
// until the new tables are classified here.

import { PHASE2_FORBIDDEN_TABLE_NAMES } from "./phase2-hosted-contract.mjs";

// Operational and effect-capable tables: prospect, contact, discovery, prospecting,
// enrichment, identity, runner, spend, outreach, and person-discovery surfaces, plus
// the hosted-activation gate. None of them may hold a row in a zero-effect run.
export const CANONICAL_EFFECT_TABLES = Object.freeze([
  "contact_eligibility_snapshots", "contact_evidence_assignments", "contact_point_observations", "contact_relevance",
  "contact_verification_intents", "contact_verification_receipts", "contacts",
  "enrichment_budget_accounts", "enrichment_grant_issuance_events", "enrichment_grant_prospects", "enrichment_grants",
  "enrichment_reservation_budget_entries", "enrichment_reservation_events", "enrichment_reservations",
  "identity_decisions", "identity_lineage", "identity_suggestion_candidates", "identity_suggestion_impacts",
  "identity_suggestions", "market_play_proposal_decisions", "market_play_proposal_evidence",
  "market_play_proposal_lineage", "market_play_proposal_versions", "market_play_proposals",
  "outreach_approval_revocations", "outreach_artifact_bindings", "outreach_audit_records", "outreach_commands",
  "outreach_dispatch_attempt_preparation_events", "outreach_dispatch_attempt_preparations",
  "outreach_message_approval_consumptions", "outreach_message_approvals", "outreach_message_versions",
  "outreach_messages", "outreach_outbox_events", "outreach_outbox_items", "outreach_package_approvals",
  "outreach_package_versions", "outreach_packages", "outreach_pre_call_recheck_receipts",
  "outreach_recipient_dispatch_authorities", "outreach_sender_capability_snapshots", "outreach_sender_connections",
  "outreach_sender_verified_addresses", "outreach_stop_events", "outreach_suppression_tombstones",
  "outreach_unsubscribe_authority_events", "person_discovery_candidates", "person_discovery_owner_decisions",
  "person_discovery_provenance", "person_discovery_run_events", "person_discovery_runs", "phase_activation_gates",
  "private_synthetic_proof_authorizations", "private_synthetic_proof_consumptions", "product_configuration_lineage",
  "product_discovery_configuration_prerequisites", "product_discovery_run_events", "product_discovery_runs",
  "product_discovery_schedules", "product_discovery_submissions", "profile_configuration_activations",
  "profile_configuration_candidates", "profile_prospects", "prospect_contact_role_relevance", "prospect_cooldowns",
  "prospect_reentry_events", "prospect_review_decisions", "prospecting_candidates", "prospecting_run_events",
  "prospecting_runs", "prospecting_schedules", "prospecting_signals", "prospecting_source_lineage", "prospects",
  "provider_quotes", "qualification_assessments", "runner_assignment_revocations", "runner_assignments",
  "runner_budget_accounts", "runner_spend_grants", "runner_spend_reservation_events", "runner_spend_reservations",
  "runner_submissions",
]);

// Local synthetic onboarding, interview, knowledge, and configuration state. These may
// hold the demo rows the browser journey writes, bounded by LOCAL_STATE_ROW_CEILING.
export const CANONICAL_LOCAL_STATE_TABLES = Object.freeze([
  // `contacts_projection_generations` holds trigger-maintained counters, not an
  // effect. Now that the local bootstrap applies the whole checked chain, 0018's
  // guards write a row here whenever the synthetic onboarding journey touches
  // `typed_configurations`, `workspaces`, or a gate. Classifying it as an effect
  // table would fail every full-chain run on a counter no operator can reach; the
  // C4 verifier already treats it the same way.
  "accounts", "artifact_configuration_dependencies", "audit_events", "authority_commands", "companies",
  "contacts_projection_generations",
  "configuration_activations", "configuration_knowledge_dependencies", "csrf_tokens", "customer_profiles",
  "drift_impact_snapshots", "import_batches", "import_items", "interview_answers", "interview_authority_bindings",
  "interview_authority_review", "interview_confirmations", "interview_questions", "interview_sessions",
  "knowledge_drifts", "knowledge_items", "knowledge_proposals", "knowledge_versions", "market_plays", "offers",
  "organizations", "products", "proposal_decisions", "proposal_prerequisites", "replacement_candidates",
  "research_candidates", "source_custody", "source_excerpts", "sources", "suppressions", "targets",
  "typed_configurations", "workspace_companies", "workspaces",
]);

// Every trigger name the checked migration chain creates. A trigger is an in-database
// effect vector (0018 and 0019 triggers write projection rows), so an unrecognized
// trigger in the persisted database fails verification.
export const CANONICAL_TRIGGERS = Object.freeze([
  "authority_command_expected_revision", "contact_assignment_scope_guard", "contact_eligibility_json_guard",
  "contact_eligibility_scope_guard", "contact_observation_scope_guard",
  "contact_verification_intent_immutable_delete", "contact_verification_intent_immutable_update",
  "contact_verification_intent_scope_guard", "contact_verification_receipt_scope_guard",
  "contacts_generation_assessment_delete", "contacts_generation_assessment_insert",
  "contacts_generation_assessment_update", "contacts_generation_assignment_delete",
  "contacts_generation_assignment_insert", "contacts_generation_assignment_update",
  "contacts_generation_candidate_delete", "contacts_generation_candidate_insert",
  "contacts_generation_candidate_update", "contacts_generation_configuration_delete",
  "contacts_generation_configuration_insert", "contacts_generation_configuration_update",
  "contacts_generation_contact_verification_intent_insert", "contacts_generation_gate_delete",
  "contacts_generation_gate_insert", "contacts_generation_gate_update", "contacts_generation_identity_delete",
  "contacts_generation_identity_insert", "contacts_generation_identity_update",
  "contacts_generation_observation_delete", "contacts_generation_observation_insert",
  "contacts_generation_observation_update", "contacts_generation_owner_update",
  "contacts_generation_person_discovery_candidate_insert", "contacts_generation_person_discovery_candidate_redact",
  "contacts_generation_person_discovery_decision_insert", "contacts_generation_person_discovery_event_insert",
  "contacts_generation_person_discovery_provenance_insert", "contacts_generation_person_discovery_provenance_redact",
  "contacts_generation_person_discovery_run_insert", "contacts_generation_prospect_contact_role_insert",
  "contacts_generation_prospect_delete", "contacts_generation_prospect_insert", "contacts_generation_prospect_update",
  "contacts_generation_receipt_delete", "contacts_generation_receipt_insert", "contacts_generation_receipt_update",
  "contacts_generation_reservation_delete", "contacts_generation_reservation_event_delete",
  "contacts_generation_reservation_event_insert", "contacts_generation_reservation_event_update",
  "contacts_generation_reservation_insert", "contacts_generation_reservation_update",
  "contacts_generation_snapshot_delete", "contacts_generation_snapshot_insert", "contacts_generation_snapshot_update",
  "enrichment_budget_entry_apply", "enrichment_budget_entry_guard", "enrichment_budget_insert_guard",
  "enrichment_budget_update_guard", "enrichment_grant_prospects_scope_guard", "enrichment_grants_scope_guard",
  "enrichment_issuance_scope_guard", "enrichment_reservation_event_guard", "enrichment_reservation_scope_guard",
  "enrichment_reservation_terminal_apply", "identity_candidate_scope_guard", "identity_candidate_shape_guard",
  "identity_decision_scope_guard", "identity_decision_shape_guard", "identity_impact_scope_guard",
  "identity_lineage_scope_guard", "identity_lineage_shape_guard", "identity_suggestion_scope_guard",
  "identity_suggestion_shape_guard", "immutable_contact_assignments_delete", "immutable_contact_assignments_update",
  "immutable_contact_eligibility_delete", "immutable_contact_eligibility_update",
  "immutable_contact_observations_delete", "immutable_contact_observations_update",
  "immutable_contact_verification_receipts_delete", "immutable_contact_verification_receipts_update",
  "immutable_enrichment_budget_accounts_delete", "immutable_enrichment_budget_entries_delete",
  "immutable_enrichment_budget_entries_update", "immutable_enrichment_events_delete",
  "immutable_enrichment_events_update", "immutable_enrichment_grant_prospects_delete",
  "immutable_enrichment_grant_prospects_update", "immutable_enrichment_grants_delete",
  "immutable_enrichment_grants_update", "immutable_enrichment_issuance_delete",
  "immutable_enrichment_issuance_update", "immutable_enrichment_reservations_delete",
  "immutable_enrichment_reservations_update", "immutable_identity_candidates_delete",
  "immutable_identity_candidates_update", "immutable_identity_decisions_delete",
  "immutable_identity_decisions_update", "immutable_identity_impacts_delete", "immutable_identity_impacts_update",
  "immutable_identity_lineage_delete", "immutable_identity_lineage_update", "immutable_identity_suggestions_delete",
  "immutable_identity_suggestions_update", "immutable_outreach_approval_revocations_delete",
  "immutable_outreach_approval_revocations_update", "immutable_outreach_artifact_bindings_delete",
  "immutable_outreach_artifact_bindings_update", "immutable_outreach_audit_delete", "immutable_outreach_audit_update",
  "immutable_outreach_commands_delete", "immutable_outreach_commands_update",
  "immutable_outreach_dispatch_attempt_preparation_events_delete",
  "immutable_outreach_dispatch_attempt_preparation_events_update",
  "immutable_outreach_dispatch_attempt_preparations_delete",
  "immutable_outreach_dispatch_attempt_preparations_update", "immutable_outreach_message_approvals_delete",
  "immutable_outreach_message_approvals_update", "immutable_outreach_message_consumptions_delete",
  "immutable_outreach_message_consumptions_update", "immutable_outreach_message_versions_delete",
  "immutable_outreach_message_versions_update", "immutable_outreach_messages_delete",
  "immutable_outreach_messages_update", "immutable_outreach_outbox_events_delete",
  "immutable_outreach_outbox_events_update", "immutable_outreach_outbox_items_delete",
  "immutable_outreach_outbox_items_update", "immutable_outreach_package_approvals_delete",
  "immutable_outreach_package_approvals_update", "immutable_outreach_package_versions_delete",
  "immutable_outreach_package_versions_update", "immutable_outreach_packages_delete",
  "immutable_outreach_packages_update", "immutable_outreach_pre_call_receipts_delete",
  "immutable_outreach_pre_call_receipts_update", "immutable_outreach_recipient_dispatch_authorities_delete",
  "immutable_outreach_recipient_dispatch_authorities_update", "immutable_outreach_sender_capability_snapshots_delete",
  "immutable_outreach_sender_capability_snapshots_update", "immutable_outreach_sender_connections_delete",
  "immutable_outreach_sender_connections_update", "immutable_outreach_sender_verified_addresses_delete",
  "immutable_outreach_sender_verified_addresses_update", "immutable_outreach_stop_events_delete",
  "immutable_outreach_stop_events_update", "immutable_outreach_suppressions_delete",
  "immutable_outreach_suppressions_update", "immutable_outreach_unsubscribe_authority_events_delete",
  "immutable_outreach_unsubscribe_authority_events_update", "immutable_provider_quotes_delete",
  "immutable_provider_quotes_update", "immutable_runner_budget_accounts_delete", "immutable_runner_events_delete",
  "immutable_runner_events_update", "immutable_runner_grants_delete", "immutable_runner_grants_update",
  "immutable_runner_reservations_delete", "immutable_runner_reservations_update",
  "knowledge_version_immutable_update", "knowledge_version_predecessor_insert",
  "market_play_proposal_decision_contract_insert", "market_play_proposal_decision_immutable_delete",
  "market_play_proposal_decision_immutable_update", "market_play_proposal_decision_scope_insert",
  "market_play_proposal_evidence_immutable_delete", "market_play_proposal_evidence_immutable_update",
  "market_play_proposal_evidence_scope_insert", "market_play_proposal_identity_immutable",
  "market_play_proposal_immutable_delete", "market_play_proposal_lineage_immutable_delete",
  "market_play_proposal_lineage_immutable_update", "market_play_proposal_lineage_scope_insert",
  "market_play_proposal_scope_insert", "market_play_proposal_version_immutable_delete",
  "market_play_proposal_version_immutable_update", "market_play_proposal_version_scope_insert",
  "market_play_workspace_parent_insert", "offer_lineage_insert", "offer_profile_only_insert",
  "outreach_approval_revocation_scope_guard", "outreach_artifact_binding_ancestry_guard",
  "outreach_artifact_binding_complete_guard", "outreach_artifact_binding_scope_guard", "outreach_audit_scope_guard",
  "outreach_command_scope_guard", "outreach_dispatch_attempt_preparation_lease_fence",
  "outreach_dispatch_attempt_preparation_scope_guard", "outreach_dispatch_attempt_preparation_void_guard",
  "outreach_dispatch_attempt_preparation_voided_terminal_fence", "outreach_dispatch_attempt_repreparation_guard",
  "outreach_message_approval_current_guard", "outreach_message_approval_delivery_authority_guard",
  "outreach_message_approval_scope_guard", "outreach_message_consumption_scope_guard", "outreach_message_scope_guard",
  "outreach_message_version_scope_guard", "outreach_outbox_event_scope_guard",
  "outreach_outbox_item_delivery_authority_guard", "outreach_outbox_item_scope_guard",
  "outreach_package_approval_current_guard", "outreach_package_approval_scope_guard", "outreach_package_scope_guard",
  "outreach_package_version_scope_guard", "outreach_pre_call_receipt_scope_guard",
  "outreach_recipient_dispatch_authority_scope_guard", "outreach_sender_capability_scope_guard",
  "outreach_sender_connection_scope_guard", "outreach_sender_verified_address_scope_guard",
  "outreach_stop_scope_guard", "outreach_suppression_scope_guard", "outreach_unsubscribe_authority_event_scope_guard",
  "person_discovery_candidate_immutable_delete", "person_discovery_candidate_redaction_guard",
  "person_discovery_candidate_scope_guard", "person_discovery_decision_immutable_delete",
  "person_discovery_decision_immutable_update", "person_discovery_decision_scope_guard",
  "person_discovery_event_immutable_delete", "person_discovery_event_immutable_update",
  "person_discovery_event_scope_guard", "person_discovery_provenance_immutable_delete",
  "person_discovery_provenance_redaction_guard", "person_discovery_provenance_scope_guard",
  "person_discovery_run_immutable_delete", "person_discovery_run_immutable_update",
  "person_discovery_run_scope_guard", "phase_gate_activation_disabled_insert", "phase_gate_immutable_update",
  "private_synthetic_proof_authorization_immutable_delete", "private_synthetic_proof_authorization_immutable_update",
  "private_synthetic_proof_authorization_run_binding_insert", "private_synthetic_proof_authorization_scope_insert",
  "private_synthetic_proof_consumption_immutable_delete", "private_synthetic_proof_consumption_immutable_update",
  "private_synthetic_proof_consumption_run_binding_insert", "private_synthetic_proof_consumption_scope_insert",
  "product_configuration_lineage_immutable_delete", "product_configuration_lineage_immutable_update",
  "product_configuration_lineage_scope_insert", "product_discovery_prerequisite_immutable_delete",
  "product_discovery_prerequisite_immutable_update", "product_discovery_prerequisite_scope_insert",
  "product_discovery_run_event_immutable_delete", "product_discovery_run_event_immutable_update",
  "product_discovery_run_event_scope_insert", "product_discovery_run_identity_immutable",
  "product_discovery_run_immutable_delete", "product_discovery_run_scope_insert",
  "product_discovery_schedule_identity_immutable", "product_discovery_schedule_immutable_delete",
  "product_discovery_schedule_scope_insert", "product_discovery_submission_immutable_delete",
  "product_discovery_submission_immutable_update", "product_discovery_submission_scope_insert",
  "product_ready_requires_complete_configuration", "products_company_scope_insert",
  "profile_configuration_activation_scope_insert", "profile_configuration_candidate_scope_insert",
  "profile_workspace_parent_insert", "prospect_contact_role_immutable_delete",
  "prospect_contact_role_immutable_update", "prospect_contact_role_scope_guard", "prospect_cooldown_immutable_delete",
  "prospect_cooldown_immutable_update", "prospect_reentry_immutable_delete", "prospect_reentry_immutable_update",
  "prospect_review_immutable_delete", "prospect_review_immutable_update", "prospecting_fact_immutable_delete",
  "prospecting_fact_immutable_update", "prospecting_lineage_immutable_delete", "prospecting_lineage_immutable_update",
  "prospecting_run_scope_insert", "prospecting_schedule_scope_insert", "prospecting_signal_immutable_delete",
  "prospecting_signal_immutable_update", "provider_quotes_scope_guard", "qualification_assessment_immutable_delete",
  "qualification_assessment_immutable_update", "runner_assignment_scope_insert",
  "runner_assignment_secret_immutable_update", "runner_budget_account_scope_guard",
  "runner_budget_account_update_guard", "runner_reservation_apply", "runner_reservation_event_scope_guard",
  "runner_reservation_scope_guard", "runner_reservation_terminal_apply", "runner_spend_grant_scope_guard",
  "runner_submission_immutable_delete", "runner_submission_immutable_update", "runner_submission_scope_insert",
  "source_custody_quarantine_only",
]);

export const CANONICAL_TABLES = Object.freeze([...CANONICAL_EFFECT_TABLES, ...CANONICAL_LOCAL_STATE_TABLES].sort());

// Phase 2 hosted-contract names the checked schema never creates. They stay forbidden
// rather than unknown so a reintroduction is reported as an effect surface, not as an
// unclassified object.
export const RETIRED_EFFECT_TABLES = Object.freeze(
  PHASE2_FORBIDDEN_TABLE_NAMES.filter((name) => !CANONICAL_TABLES.includes(name)).sort(),
);

// Everything that must be absent or empty, in one list.
export const FORBIDDEN_TABLE_NAMES = Object.freeze([...CANONICAL_EFFECT_TABLES, ...RETIRED_EFFECT_TABLES].sort());

// Names reserved by SQLite, D1, and Miniflare for their own bookkeeping. They carry no
// application rows and are reported, not counted, so engine metadata cannot be mistaken
// for an unknown application object. A reserved name can never shadow a forbidden one:
// forbidden names are matched first and none of them uses a reserved prefix.
export const RESERVED_OBJECT_PREFIXES = Object.freeze(["sqlite_", "_cf_", "_mf_", "d1_"]);

// Generous per-table ceiling for the single synthetic workspace the browser journey
// creates. It bounds the allowlist so a bulk import or replayed journey is a failure
// rather than accepted local state.
export const LOCAL_STATE_ROW_CEILING = 5000;

export const OBJECT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isReservedObjectName(name) {
  return OBJECT_NAME_PATTERN.test(name) && RESERVED_OBJECT_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// "effect" and "retired-effect" must be empty, "local-state" is bounded, "reserved" is
// engine metadata, and "unknown" fails verification.
export function classifyTable(name) {
  if (CANONICAL_EFFECT_TABLES.includes(name)) return "effect";
  if (RETIRED_EFFECT_TABLES.includes(name)) return "retired-effect";
  if (CANONICAL_LOCAL_STATE_TABLES.includes(name)) return "local-state";
  if (isReservedObjectName(name)) return "reserved";
  return "unknown";
}

export function classifyTrigger(name) {
  if (CANONICAL_TRIGGERS.includes(name)) return "canonical";
  if (isReservedObjectName(name)) return "reserved";
  return "unknown";
}

// Fail at import rather than mid-verification if the inventory itself is inconsistent.
for (const list of [CANONICAL_EFFECT_TABLES, CANONICAL_LOCAL_STATE_TABLES, CANONICAL_TRIGGERS]) {
  for (const name of list) {
    if (!OBJECT_NAME_PATTERN.test(name)) throw new Error(`zero_effects_inventory_name_invalid:${name}`);
    if (isReservedObjectName(name)) throw new Error(`zero_effects_inventory_name_reserved:${name}`);
  }
}
for (const name of CANONICAL_EFFECT_TABLES) {
  if (CANONICAL_LOCAL_STATE_TABLES.includes(name)) throw new Error(`zero_effects_inventory_table_double_classified:${name}`);
}
for (const name of PHASE2_FORBIDDEN_TABLE_NAMES) {
  if (!FORBIDDEN_TABLE_NAMES.includes(name)) throw new Error(`zero_effects_inventory_phase2_table_uncovered:${name}`);
}
for (const list of [CANONICAL_TABLES, CANONICAL_TRIGGERS]) {
  if (new Set(list).size !== list.length) throw new Error("zero_effects_inventory_duplicate_name");
}
