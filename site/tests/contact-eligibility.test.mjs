import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const NOW = 1_800_000_000_000;
const DIGEST = "a".repeat(64);
const assignment = Object.freeze({
  workspaceId: "workspace-synthetic",
  contactId: "contact-synthetic",
  profileConfigurationId: "config-synthetic",
  profileConfigurationDigest: DIGEST,
  providerAuthority: Object.freeze({ providerId: "synthetic-provider", providerVersion: "v1", catalogRef: "catalog-synthetic" }),
});

async function modules() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return { vite, evidence: await vite.ssrLoadModule(new URL("../domain/contact-evidence.ts", import.meta.url).pathname), eligibility: await vite.ssrLoadModule(new URL("../domain/contact-eligibility.ts", import.meta.url).pathname) };
}
function envelope(patch = {}) {
  return {
    id: "observation-synthetic", workspaceId: assignment.workspaceId, contactId: assignment.contactId,
    profileConfigurationId: assignment.profileConfigurationId, profileConfigurationDigest: assignment.profileConfigurationDigest,
    kind: "email", value: "  CONTACT@EXAMPLE.TEST ", confidence: 0.01,
    provenance: { sourceReference: "synthetic-source", excerpt: "synthetic business directory record", objectReference: "synthetic-object", contentHash: "b".repeat(64), retrievedAt: NOW - 2_000 },
    observedAt: NOW - 1_000, lineage: { parentObservationId: null }, ...patch,
  };
}
function trustedVerification(raw = envelope(), patch = {}) {
  const normalizedValue = raw.kind === "email"
    ? String(raw.value).trim().toLowerCase()
    : `+${String(raw.value).slice(1).replace(/[^0-9]/g, "")}`;
  return {
    observationId: raw.id, workspaceId: raw.workspaceId, contactId: raw.contactId,
    profileConfigurationId: raw.profileConfigurationId, profileConfigurationDigest: raw.profileConfigurationDigest,
    kind: raw.kind, normalizedValue, contentHash: raw.provenance.contentHash,
    verificationClass: "mailbox_verified", method: "mailbox_verification", verifiedAt: NOW - 1_500,
    providerId: "synthetic-provider", providerVersion: "v1", catalogRef: "catalog-synthetic",
    verifierId: "server-verifier", verifierVersion: "v1", verdictReference: "verdict-synthetic",
    verdictDigest: "d".repeat(64), ...patch,
  };
}
function ingest(evidence, raw = envelope(), verificationPatch = {}) {
  return evidence.ingestContactEvidence(assignment, raw, trustedVerification(raw, verificationPatch));
}
function target(patch = {}) { return { workspaceId: assignment.workspaceId, contactId: assignment.contactId, ...patch }; }
function strategy(patch = {}) { return { configurationId: assignment.profileConfigurationId, configurationDigest: DIGEST, ...patch }; }
function authority(patch = {}) { return { profileAvailable: true, configurationCurrent: true, phase4Approved: true, contactCapabilityEnabled: true, drifted: false, disqualified: false, suppressed: false, ...patch }; }

test("P5 prep accepts only bounded assignment-bound evidence and canonicalizes synthetic business contact values", async () => {
  const { vite, evidence } = await modules();
  try {
    const accepted = ingest(evidence);
    assert.equal(accepted.accepted, true);
    assert.equal(accepted.observation.normalizedValue, "contact@example.test");
    assert.equal(Object.isFrozen(accepted.observation), true);
    assert.equal(evidence.normalizeBusinessPhone(" +1 (416) 555-0199 "), "+14165550199");
    assert.equal(evidence.normalizeBusinessPhone("not-a-phone"), null);
    assert.equal(evidence.normalizeBusinessPhone("4165550199"), null, "a local number is not silently promoted to E.164");
    assert.equal(evidence.normalizeBusinessEmail("not an email"), null);
    for (const patch of [{ workspaceId: "other-workspace" }, { verificationClass: "mailbox_verified" }, { providerId: "adapter-provider" }, { provenance: { ...envelope().provenance, excerpt: "<script>" } }, { profileConfigurationDigest: "c".repeat(64) }]) {
      assert.equal(evidence.ingestContactEvidence(assignment, envelope(patch), trustedVerification(envelope(patch))).accepted, false, JSON.stringify(patch));
    }
    assert.equal(
      evidence.ingestContactEvidence(assignment, envelope(), trustedVerification(envelope(), { providerId: "different-provider" })).accepted,
      false,
      "trusted verdict must still match the committed provider tuple",
    );
    const unverified = evidence.ingestContactEvidence(assignment, envelope());
    assert.equal(unverified.accepted, true);
    assert.equal(unverified.observation.verificationClass, "suggested", "absence of a trusted verifier can only create a suggestion");
  } finally { await vite.close(); }
});

test("P5 prep verification class, not adapter confidence, controls eligibility", async () => {
  const { vite, evidence, eligibility } = await modules();
  try {
    assert.deepEqual(evidence.CONTACT_VERIFICATION_CLASSES, ["suggested", "domain_valid", "mailbox_verified", "source_verified", "invalid"]);
    for (const verificationClass of ["suggested", "domain_valid"]) {
      const method = verificationClass === "suggested" ? "pattern_inference" : "domain_validation";
      const raw = envelope({ confidence: 1 });
      const accepted = ingest(evidence, raw, { verificationClass, method, verifiedAt: null });
      assert.equal(accepted.accepted, true);
      const result = eligibility.projectContactEligibility({ target: target(), points: [accepted.observation], strategy: strategy(), authority: authority(), now: NOW });
      assert.equal(result.state, "ContactSuggestion", verificationClass);
      assert.equal(result.eligible, false, verificationClass);
    }
    const forged = ingest(evidence, envelope({ confidence: 1 }), { verificationClass: "source_verified", method: "domain_validation", verifiedAt: NOW - 1_500 });
    assert.equal(forged.accepted, false, "an adapter assertion cannot promote domain validation");
    const invalid = ingest(evidence, envelope({ confidence: 1 }), { verificationClass: "invalid", method: "mailbox_verification", verifiedAt: NOW - 1_500 });
    assert.equal(invalid.accepted, true, "negative verification evidence is retained rather than silently discarded");
    assert.equal(eligibility.projectContactEligibility({ target: target(), points: [invalid.observation], strategy: strategy(), authority: authority(), now: NOW }).state, "NeedsReview");
  } finally { await vite.close(); }
});

test("P5 prep refuses direct forged or partial verified observation shapes", async () => {
  const { vite, evidence, eligibility } = await modules();
  try {
    const forged = { id: "forged-observation", kind: "email", normalizedValue: "contact@example.test", verificationClass: "mailbox_verified", confidence: 1, method: "mailbox_verification", verifiedAt: NOW - 1, observedAt: NOW };
    assert.equal(evidence.isDefensivelyValidContactObservation(forged), false);
    const result = eligibility.projectContactEligibility({ target: target(), points: [forged], strategy: strategy(), authority: authority(), now: NOW });
    assert.equal(result.state, "ContactSuggestion");
    assert.equal(result.eligible, false);
    assert.ok(result.reasonCodes.includes("no_contact_evidence"));
    const accepted = ingest(evidence);
    assert.equal(accepted.accepted, true);
    const mismatchedVerifiedPhone = { ...accepted.observation, kind: "phone", normalizedValue: "+14165550199" };
    assert.equal(evidence.isDefensivelyValidContactObservation(mismatchedVerifiedPhone), false, "mailbox verification is never a phone verification");
    assert.notEqual(eligibility.projectContactEligibility({ target: target(), points: [mismatchedVerifiedPhone], strategy: strategy(), authority: authority(), now: NOW }).state, "ContactReady");
    for (const foreignTarget of [target({ workspaceId: "workspace-foreign" }), target({ contactId: "contact-foreign" })]) {
      const scoped = eligibility.projectContactEligibility({ target: foreignTarget, points: [accepted.observation], strategy: strategy(), authority: authority(), now: NOW });
      assert.equal(scoped.state, "NeedsReview");
      assert.equal(scoped.eligible, false);
      assert.equal(scoped.points[0].state, "scope_mismatch");
      assert.ok(scoped.reasonCodes.includes("contact_scope_mismatch"));
    }
    const missingTarget = eligibility.projectContactEligibility({ points: [accepted.observation], strategy: strategy(), authority: authority(), now: NOW });
    assert.equal(missingTarget.state, "NeedsReview");
    assert.ok(missingTarget.reasonCodes.includes("invalid_contact_target"));
  } finally { await vite.close(); }
});

test("P5 prep applies default 30/90/90 day freshness and current invalidations", async () => {
  const { vite, evidence, eligibility } = await modules();
  try {
    const mailboxVerifiedAt = NOW - (30 * 24 * 60 * 60 * 1000) + 1;
    const mailboxRaw = envelope({ observedAt: NOW, provenance: { ...envelope().provenance, retrievedAt: mailboxVerifiedAt - 1 } });
    const mailbox = ingest(evidence, mailboxRaw, { verifiedAt: mailboxVerifiedAt });
    assert.equal(mailbox.accepted, true);
    assert.equal(eligibility.projectContactEligibility({ target: target(), points: [mailbox.observation], strategy: strategy(), authority: authority(), now: NOW }).state, "ContactReady");
    assert.equal(eligibility.projectContactEligibility({ target: target(), points: [mailbox.observation], strategy: strategy(), authority: authority(), now: NOW + 1 }).state, "NeedsReview");
    const phoneVerifiedAt = NOW - (90 * 24 * 60 * 60 * 1000) + 1;
    const phoneRaw = envelope({ id: "phone-synthetic", kind: "phone", value: "+14165550199", observedAt: NOW, provenance: { ...envelope().provenance, retrievedAt: phoneVerifiedAt - 1 } });
    const phone = ingest(evidence, phoneRaw, { verificationClass: "source_verified", method: "authoritative_source_reconfirmed", verifiedAt: phoneVerifiedAt });
    assert.equal(phone.accepted, true);
    assert.equal(eligibility.projectContactEligibility({ target: target(), points: [phone.observation], strategy: strategy(), authority: authority(), now: NOW }).state, "ContactReady");
    const sourceEmailVerifiedAt = NOW - (90 * 24 * 60 * 60 * 1000) + 1;
    const sourceEmailRaw = envelope({ id: "source-email-synthetic", observedAt: NOW, provenance: { ...envelope().provenance, retrievedAt: sourceEmailVerifiedAt - 1 } });
    const sourceEmail = ingest(evidence, sourceEmailRaw, { verificationClass: "source_verified", method: "authoritative_source_reconfirmed", verifiedAt: sourceEmailVerifiedAt });
    assert.equal(sourceEmail.accepted, true);
    assert.equal(eligibility.projectContactEligibility({ target: target(), points: [sourceEmail.observation], strategy: strategy(), authority: authority(), now: NOW }).state, "ContactReady");
    assert.equal(eligibility.projectContactEligibility({ target: target(), points: [sourceEmail.observation], strategy: strategy(), authority: authority(), now: NOW + 1 }).state, "NeedsReview");
    for (const patch of [{ drifted: true }, { disqualified: true }, { suppressed: true }, { profileAvailable: false }, { configurationCurrent: false }, { phase4Approved: false }, { contactCapabilityEnabled: false }]) {
      const result = eligibility.projectContactEligibility({ target: target(), points: [mailbox.observation], strategy: strategy(), authority: authority(patch), now: NOW });
      assert.notEqual(result.state, "ContactReady", JSON.stringify(patch));
    }
    assert.equal(eligibility.projectContactEligibility({ target: target(), points: [mailbox.observation], strategy: strategy(), now: NOW }).state, "NeedsReview", "production default is fail closed");
  } finally { await vite.close(); }
});

test("P5 prep invalidates observations from a different current Contact Strategy with zero downstream effects", async () => {
  const { vite, evidence, eligibility } = await modules();
  try {
    const accepted = ingest(evidence);
    assert.equal(accepted.accepted, true);
    const zeroEffects = { packageMutations: 0, exportMutations: 0, callInvocations: 0, sendInvocations: 0, suppressionMutations: 0 };
    for (const currentStrategy of [strategy({ configurationId: "config-new" }), strategy({ configurationDigest: "c".repeat(64) })]) {
      const input = { target: target(), points: [accepted.observation], strategy: currentStrategy, authority: authority(), now: NOW };
      const projection = eligibility.projectContactEligibility(input);
      assert.equal(projection.state, "NeedsReview");
      assert.equal(projection.eligible, false);
      assert.equal(projection.points[0].state, "configuration_mismatch");
      assert.ok(projection.reasonCodes.includes("contact_configuration_mismatch"));
      for (const helper of [eligibility.recheckForPackageApproval, eligibility.recheckForCrmExport, eligibility.recheckForClickToCall, eligibility.recheckForFinalSend]) {
        const recheck = helper(input);
        assert.equal(recheck.blocked, true);
        assert.equal(recheck.eligibility.state, "NeedsReview");
        assert.deepEqual(recheck.effectsBefore, zeroEffects);
        assert.deepEqual(recheck.effectsAfter, zeroEffects);
      }
    }
  } finally { await vite.close(); }
});

test("P5 prep later-boundary helpers only return rechecks and have exact Phase 6/7 zero effects", async () => {
  const { vite, evidence, eligibility } = await modules();
  try {
    const accepted = ingest(evidence);
    assert.equal(accepted.accepted, true);
    const input = { target: target(), points: [accepted.observation], strategy: strategy(), authority: authority(), now: NOW };
    for (const helper of [eligibility.recheckForPackageApproval, eligibility.recheckForCrmExport, eligibility.recheckForClickToCall, eligibility.recheckForFinalSend]) {
      const result = helper(input);
      assert.equal(result.blocked, true);
      assert.equal(result.eligibility.state, "ContactReady", "a projection is not later-phase authority");
      assert.deepEqual(result.effectsBefore, { packageMutations: 0, exportMutations: 0, callInvocations: 0, sendInvocations: 0, suppressionMutations: 0 });
      assert.deepEqual(result.effectsAfter, result.effectsBefore);
    }
  } finally { await vite.close(); }
});
