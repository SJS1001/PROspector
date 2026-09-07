// Tables the greenfield local attestation must find present and empty.
//
// Presence is proved by the count itself: a bootstrap that stopped short of the
// canonical migration head cannot answer these queries, so a truncated chain
// fails closed instead of reporting a green baseline over a missing
// Contacts/Person Discovery schema.
//
// This list is a separate module so readiness tests can import it without
// executing the attestation script.
export const GREENFIELD_REQUIRED_EMPTY_TABLES = Object.freeze([
  "workspaces",
  "phase_activation_gates",
  "product_discovery_runs",
  "prospects",
  "enrichment_grants",
  "contact_point_observations",
  "suppressions",
  "contacts",
  "contacts_projection_generations",
  "person_discovery_runs",
  "person_discovery_run_events",
  "person_discovery_candidates",
  "person_discovery_provenance",
  "person_discovery_owner_decisions",
  "prospect_contact_role_relevance",
  "contact_verification_intents",
]);
