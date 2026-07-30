import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_FIELDS,
  CONSENSUS_KNOWLEDGE_SCOPE,
  buildGateCommands,
  inspectStatus,
  parseGateArgs,
  tupleDigest,
} from "../scripts/phase2-gate.mjs";

const tuple = {
  capability: "consensus_knowledge",
  authorization_reference: "authorization-02-18-consensus-knowledge",
  target_project_deployment: "appgprj_private~appgdep_reviewed",
  reviewed_source_digest: `sha256:${"a".repeat(64)}`,
  migration_identity_status: "0004:additive-identity-proven",
  post_migration_evidence_reference: "post-migration-proof-0004",
  independent_review_reference: "independent-review-02-15",
  deployed_boundary_proof_reference: "deployed-boundary-proof-02-17",
};

test("gate tuple is canonical, fixed-order, and its inspect command is read-only", () => {
  assert.deepEqual(Object.keys(tuple), CANONICAL_FIELDS);
  const args = ["inspect", "--database", "pilot_d1", "--workspace-id", "workspace_opaque"];
  const commands = buildGateCommands(parseGateArgs(args));
  assert.equal(commands.length, 1);
  assert.match(commands[0].args.at(-1), /^SELECT /u);
  assert.doesNotMatch(commands[0].args.at(-1), /\b(INSERT|UPDATE|DELETE)\b/iu);
  assert.equal(tupleDigest(tuple), tupleDigest({ ...tuple }));
  assert.equal(inspectStatus([]), "absent");
  assert.equal(inspectStatus([{ capability: "consensus_knowledge", tuple_digest: "a".repeat(64) }]), "exact");
  assert.equal(inspectStatus([{ capability: "consensus_knowledge", tuple_digest: "bad" }, { capability: "consensus_knowledge", tuple_digest: "b".repeat(64) }]), "overbroad");
});

test("gate activation is hard-disabled until a trusted server authorization anchor exists", () => {
  const args = ["activate", "--database", "pilot_d1", "--workspace-id", "workspace_opaque", ...CANONICAL_FIELDS.flatMap((field) => [`--${field.replaceAll("_", "-")}`, tuple[field]])];
  assert.throws(() => parseGateArgs(args), /activation_not_authorized/);
  assert.deepEqual(CONSENSUS_KNOWLEDGE_SCOPE, { intake: "import_plain_text", encoding: "utf-8", maximumBytes: 8192, destination: "Proposed Knowledge", excluded: ["multipart", "file_upload", "import_batch", "filename_authority", "path_authority", "html_parser", "binary_parser", "operational_import"] });
});
