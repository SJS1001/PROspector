import { CANONICAL_MIGRATION_FILENAMES } from "./migration-chain.mjs";

export const PERSON_DISCOVERY_C4_BINDING_NAME = "PROSPECTOR_PERSON_DISCOVERY_C4";
export const PERSON_DISCOVERY_C4_BINDING_VALUE = "synthetic-zero-network-c4-v1";

// The C4 lane is the full-chain lane, so it takes the canonical chain verbatim
// rather than keeping a second copy that can fall behind the journal.
export const PERSON_DISCOVERY_C4_MIGRATIONS = CANONICAL_MIGRATION_FILENAMES;

export function personDiscoveryC4Bindings() {
  return Object.freeze({ [PERSON_DISCOVERY_C4_BINDING_NAME]: PERSON_DISCOVERY_C4_BINDING_VALUE });
}
