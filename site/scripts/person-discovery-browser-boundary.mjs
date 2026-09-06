export const PERSON_DISCOVERY_C4_BINDING_NAME = "PROSPECTOR_PERSON_DISCOVERY_C4";
export const PERSON_DISCOVERY_C4_BINDING_VALUE = "synthetic-zero-network-c4-v1";

export const PERSON_DISCOVERY_C4_MIGRATIONS = Object.freeze([
  "0000_jittery_meteorite.sql",
  "0001_true_spencer_smythe.sql",
  "0002_eager_supreme_intelligence.sql",
  "0003_acoustic_magik.sql",
  "0004_consensus_knowledge.sql",
  "0005_even_mastermind.sql",
  "0006_private-proof-run-binding.sql",
  "0007_profile_prospecting.sql",
  "0008_controlled_enrichment.sql",
  "0009_gorgeous_captain_universe.sql",
  "0010_governed_outreach.sql",
  "0011_enrichment_candidate_lineage.sql",
  "0012_governed_outreach_outbox.sql",
  "0013_governed_outreach_lease.sql",
  "0014_governed-outreach-authority.sql",
  "0015_governed-outreach-pre-call.sql",
  "0016_governed-outreach-attempt-preparation.sql",
  "0017_governed-outreach-preparation-recovery.sql",
  "0018_massive_blizzard.sql",
  "0019_person_discovery.sql",
]);

export function personDiscoveryC4Bindings() {
  return Object.freeze({ [PERSON_DISCOVERY_C4_BINDING_NAME]: PERSON_DISCOVERY_C4_BINDING_VALUE });
}
