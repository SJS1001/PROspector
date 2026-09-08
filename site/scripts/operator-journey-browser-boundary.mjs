import { CANONICAL_MIGRATION_FILENAMES } from "./migration-chain.mjs";
import { PERSON_DISCOVERY_C4_BINDING_NAME, PERSON_DISCOVERY_C4_BINDING_VALUE } from "./person-discovery-browser-boundary.mjs";

export const OPERATOR_JOURNEY_E1_BINDING_NAME = "PROSPECTOR_OPERATOR_JOURNEY_E1";
export const OPERATOR_JOURNEY_E1_BINDING_VALUE = "synthetic-zero-network-e1-v1";

// E1 is a full-chain lane, so it takes the canonical chain verbatim rather than
// keeping a second copy that can fall behind the journal.
export const OPERATOR_JOURNEY_E1_MIGRATIONS = CANONICAL_MIGRATION_FILENAMES;

/** E1 seeds the shared hierarchy through the C4 fixture, so it carries that
 * binding too. It composes no discovery service and calls no provider: the C4
 * binding only makes the shared synthetic hierarchy seedable. */
export function operatorJourneyE1Bindings() {
  return Object.freeze({
    [PERSON_DISCOVERY_C4_BINDING_NAME]: PERSON_DISCOVERY_C4_BINDING_VALUE,
    [OPERATOR_JOURNEY_E1_BINDING_NAME]: OPERATOR_JOURNEY_E1_BINDING_VALUE,
  });
}
