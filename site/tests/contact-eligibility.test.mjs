import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_800_000_000_000;
const DIGEST = "a".repeat(64);
const assignment = Object.freeze({ workspaceId: "workspace-synthetic", contactId: "contact-synthetic", profileConfigurationId: "config-synthetic", profileConfigurationDigest: DIGEST });

async function modules() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return { vite, evidence: await vite.ssrLoadModule(new URL("../domain/contact-evidence.ts", import.meta.url).pathname), eligibility: await vite.ssrLoadModule(new URL("../domain/contact-eligibility.ts", import.meta.url).pathname) };
}
function envelope(patch = {}) {
  return {
    id: "observation-synthetic", workspaceId: assignment.workspaceId, contactId: assignment.contactId,
    profileConfigurationId: assignment.profileConfigurationId, profileConfigurationDigest: assignment.profileConfigurationDigest,
    kind: "email", value: "  CONTACT@EXAMPLE.TEST ", verificationClass: "mailbox_verified", confidence: 0.01,
    method: "mailbox_verification", provenance: { sourceReference: "synthetic-source", excerpt: "synthetic business directory record", objectReference: "synthetic-object", contentHash: "b".repeat(64), retrievedAt: NOW - 2_000 },
    observedAt: NOW - 1_000, verifiedAt: NOW - 1_500, provider: "synthetic-fake", catalogVersion: "synthetic-v1", lineage: { parentObservationId: null }, ...patch,
  };
}
function strategy() { return { configurationId: assignment.profileConfigurationId, configurationDigest: DIGEST }; }
function authority(patch = {}) { return { profileAvailable: true, configurationCurrent: true, phase4Approved: true, contactCapabilityEnabled: true, drifted: false, disqualified: false, suppressed: false, ...patch }; }

test("P5 prep accepts only bounded assignment-bound evidence and canonicalizes synthetic business contact values", async () => {
  const { vite, evidence } = await modules();
  try {
    const accepted = evidence.ingestContactEvidence(assignment, envelope());
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.observation.normalizedValue, "contact@example.test");
    assert.equal(Object.isFrozen(accepted.observation), true);
    assert.equal(evidence.normalizeBusinessPhone(" +1 (416) 555-0199 "), "+14165550199");
    assert.equal(evidence.normalizeBusinessPhone("not-a-phone"), null);
    assert.equal(evidence.normalizeBusinessPhone("4165550199"), null, "a local number is not silently promoted to E.164");
    assert.equal(evidence.normalizeBusinessEmail("not an email"), null);
    for (const patch of [{ workspaceId: "other-workspace" }, { verificationClass: "provider_verified" }, { method: "mailbox_verification", kind: "phone", value: "+14165550199" }, { provenance: { ...envelope().provenance, excerpt: "<script>" } }, { profileConfigurationDigest: "c".repeat(64) }]) {
      assert.equal(evidence.ingestContactEvidence(assignment, envelope(patch)).accepted, false, JSON.stringify(patch));
    }
  } finally { await vite.close(); }
});

test("P5 prep verification class, not adapter confidence, controls eligibility", async () => {
  const { vite, evidence, eligibility } = await modules();
  try {
    assert.deepEqual(evidence.CONTACT_VERIFICATION_CLASSES, ["suggested", "domain_valid", "mailbox_verified", "source_verified", "invalid"]);
    for (const verificationClass of ["suggested", "domain_valid"]) {
      const method = verificationClass === "suggested" ? "pattern_inference" : "domain_validation";
      const accepted = evidence.ingestContactEvidence(assignment, envelope({ verificationClass, method, confidence: 1 }));
      assert.equal(accepted.accepted, true);
      const result = eligibility.projectContactEligibility({ points: [accepted.observation], strategy: strategy(), authority: authority(), now: NOW });
      assert.equal(result.state, "ContactSuggestion", verificationClass);
      assert.equal(result.eligible, false, verificationClass);
    }
    const forged = evidence.ingestContactEvidence(assignment, envelope({ verificationClass: "source_verified", method: "domain_validation", confidence: 1 }));
    assert.equal(forged.accepted, false, "an adapter assertion cannot promote domain validation");
    const invalid = evidence.ingestContactEvidence(assignment, envelope({ verificationClass: "invalid", method: "mailbox_verification", confidence: 1 }));
    assert.equal(invalid.accepted, true, "negative verification evidence is retained rather than silently discarded");
    assert.equal(eligibility.projectContactEligibility({ points: [invalid.observation], strategy: strategy(), authority: authority(), now: NOW }).state, "NeedsReview");
  } finally { await vite.close(); }
});

test("P5 prep refuses direct forged or partial verified observation shapes", async () => {
  const { vite, evidence, eligibility } = await modules();
  try {
    const forged = { id: "forged-observation", kind: "email", normalizedValue: "contact@example.test", verificationClass: "mailbox_verified", confidence: 1, method: "mailbox_verification", verifiedAt: NOW - 1, observedAt: NOW };
    assert.equal(evidence.isDefensivelyValidContactObservation(forged), false);
    const result = eligibility.projectContactEligibility({ points: [forged], strategy: strategy(), authority: authority(), now: NOW });
    assert.equal(result.state, "ContactSuggestion");
    assert.equal(result.eligible, false);
    assert.ok(result.reasonCodes.includes("no_contact_evidence"));
    const accepted = evidence.ingestContactEvidence(assignment, envelope());
    assert.equal(accepted.accepted, true);
    const mismatchedVerifiedPhone = { ...accepted.observation, kind: "phone", normalizedValue: "+14165550199" };
    assert.equal(evidence.isDefensivelyValidContactObservation(mismatchedVerifiedPhone), false, "mailbox verification is never a phone verification");
    assert.notEqual(eligibility.projectContactEligibility({ points: [mismatchedVerifiedPhone], strategy: strategy(), authority: authority(), now: NOW }).state, "ContactReady");
  } finally { await vite.close(); }
});

test("P5 prep applies default 30/90/90 day freshness and current invalidations", async () => {
  const { vite, evidence, eligibility } = await modules();
  try {
    const mailboxVerifiedAt = NOW - (30 * 24 * 60 * 60 * 1000) + 1;
    const mailbox = evidence.ingestContactEvidence(assignment, envelope({ observedAt: NOW, verifiedAt: mailboxVerifiedAt, provenance: { ...envelope().provenance, retrievedAt: mailboxVerifiedAt - 1 } }));
    assert.equal(mailbox.accepted, true);
    assert.equal(eligibility.projectContactEligibility({ points: [mailbox.observation], strategy: strategy(), authority: authority(), now: NOW }).state, "ContactReady");
    assert.equal(eligibility.projectContactEligibility({ points: [mailbox.observation], strategy: strategy(), authority: authority(), now: NOW + 1 }).state, "NeedsReview");
    const phoneVerifiedAt = NOW - (90 * 24 * 60 * 60 * 1000) + 1;
    const phone = evidence.ingestContactEvidence(assignment, envelope({ id: "phone-synthetic", kind: "phone", value: "+14165550199", verificationClass: "source_verified", method: "authoritative_source_reconfirmed", observedAt: NOW, verifiedAt: phoneVerifiedAt, provenance: { ...envelope().provenance, retrievedAt: phoneVerifiedAt - 1 } }));
    assert.equal(phone.accepted, true);
    assert.equal(eligibility.projectContactEligibility({ points: [phone.observation], strategy: strategy(), authority: authority(), now: NOW }).state, "ContactReady");
    const sourceEmailVerifiedAt = NOW - (90 * 24 * 60 * 60 * 1000) + 1;
    const sourceEmail = evidence.ingestContactEvidence(assignment, envelope({ id: "source-email-synthetic", verificationClass: "source_verified", method: "authoritative_source_reconfirmed", observedAt: NOW, verifiedAt: sourceEmailVerifiedAt, provenance: { ...envelope().provenance, retrievedAt: sourceEmailVerifiedAt - 1 } }));
    assert.equal(sourceEmail.accepted, true);
    assert.equal(eligibility.projectContactEligibility({ points: [sourceEmail.observation], strategy: strategy(), authority: authority(), now: NOW }).state, "ContactReady");
    assert.equal(eligibility.projectContactEligibility({ points: [sourceEmail.observation], strategy: strategy(), authority: authority(), now: NOW + 1 }).state, "NeedsReview");
    for (const patch of [{ drifted: true }, { disqualified: true }, { suppressed: true }, { profileAvailable: false }, { configurationCurrent: false }, { phase4Approved: false }, { contactCapabilityEnabled: false }]) {
      const result = eligibility.projectContactEligibility({ points: [mailbox.observation], strategy: strategy(), authority: authority(patch), now: NOW });
      assert.notEqual(result.state, "ContactReady", JSON.stringify(patch));
    }
    assert.equal(eligibility.projectContactEligibility({ points: [mailbox.observation], strategy: strategy(), now: NOW }).state, "NeedsReview", "production default is fail closed");
  } finally { await vite.close(); }
});

test("P5 prep later-boundary helpers only return rechecks and have exact Phase 6/7 zero effects", async () => {
  const { vite, evidence, eligibility } = await modules();
  try {
    const accepted = evidence.ingestContactEvidence(assignment, envelope());
    assert.equal(accepted.accepted, true);
    const input = { points: [accepted.observation], strategy: strategy(), authority: authority(), now: NOW };
    for (const helper of [eligibility.recheckForPackageApproval, eligibility.recheckForCrmExport, eligibility.recheckForClickToCall, eligibility.recheckForFinalSend]) {
      const result = helper(input);
      assert.equal(result.blocked, true);
      assert.equal(result.eligibility.state, "ContactReady", "a projection is not later-phase authority");
      assert.deepEqual(result.effectsBefore, { packageMutations: 0, exportMutations: 0, callInvocations: 0, sendInvocations: 0, suppressionMutations: 0 });
      assert.deepEqual(result.effectsAfter, result.effectsBefore);
    }
  } finally { await vite.close(); }
});
