import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

import { countRows, createD1Fixture } from "./helpers/d1.mjs";
import { OUTREACH_NOW, OUTREACH_OWNER, seedOutreachAuthority } from "./helpers/outreach-fixture.mjs";
import {
  DAY_MS,
  loadArtifactModules,
  pureSyntheticBindings,
  pureSyntheticMessageDraft,
  pureSyntheticPackageDraft,
  recordRecipientAuthority,
  seededBindings,
  seededMessageDraft,
  seededPackageDraft,
  syntheticContactEvidence,
  syntheticEligibilityPort,
} from "./helpers/outreach-artifacts-fixture.mjs";

// 06-01 Task 1, 06-02 artifact test, and 06-03: canonical immutable Outreach
// Package and Message Version authority over the existing repository seam.
// Synthetic data only. No provider, MailPort, outbox, or send path is reached.

let vite;
let modules;

before(async () => {
  vite = await createServer({ configFile: false, logLevel: "silent" });
  modules = await loadArtifactModules(vite);
});

after(async () => {
  await vite?.close();
});

const NO_SEND_TABLES = ["outreach_outbox_items", "outreach_outbox_events", "outreach_message_approval_consumptions"];

function scope(seeded) {
  return { workspaceId: seeded.workspaceId, ownerSubject: OUTREACH_OWNER.subject, now: () => OUTREACH_NOW };
}

function setPath(target, path, value) {
  const copy = structuredClone(target);
  let cursor = copy;
  for (const key of path.slice(0, -1)) cursor = cursor[key];
  cursor[path.at(-1)] = value;
  return copy;
}

test("package canonicalization is a strict allowlist with canonical ordered JSON", async () => {
  const { packages } = modules;
  assert.equal(packages.DEFAULT_PACKAGE_APPROVAL_TTL_MS, 30 * DAY_MS);
  assert.deepEqual([...packages.PACKAGE_VERSION_FIELDS].sort(), [
    "bindings", "configurationDigest", "configurationId", "configurationRevision", "contactEligibilitySnapshotId",
    "contactId", "contactRevision", "packageId", "profileId", "prospectId", "prospectRevision", "snapshot", "version",
  ]);
  assert.deepEqual([...packages.PACKAGE_SNAPSHOT_FIELDS].sort(), [
    "callScript", "claimGuardrailDigests", "draftMessageIds", "evidenceDigests", "recommendedAngle", "selectedContactPointDigests", "selectedRole",
  ]);

  const draft = pureSyntheticPackageDraft();
  const canonical = packages.canonicalOutreachPackage(draft);
  assert.equal(canonical.schema, "outreach-package-version/v1");
  assert.ok(Object.isFrozen(canonical) && Object.isFrozen(canonical.snapshot) && Object.isFrozen(canonical.bindings));
  const json = packages.canonicalJson(canonical);
  const keys = Object.keys(JSON.parse(json));
  assert.deepEqual(keys, [...keys].sort(), "top-level keys are sorted");
  const digest = await packages.outreachPackageDigest(canonical);
  assert.match(digest, /^[a-f0-9]{64}$/u);
  assert.equal(digest, await packages.sha256Hex(json), "the digest is SHA-256 over canonical JSON");

  // Set-like lists, binding order, and key insertion order do not change the digest.
  const reordered = {
    ...Object.fromEntries(Object.entries(draft).reverse()),
    snapshot: {
      ...draft.snapshot,
      evidenceDigests: [...draft.snapshot.evidenceDigests].reverse(),
      draftMessageIds: [...draft.snapshot.draftMessageIds].reverse(),
    },
    bindings: [...draft.bindings].reverse(),
  };
  assert.equal(await packages.outreachPackageDigest(packages.canonicalOutreachPackage(reordered)), digest);

  // Every allowlisted field is digest-bearing.
  const edits = [
    [["packageId"], "synthetic-package-other"],
    [["prospectId"], "synthetic-prospect-other"],
    [["contactId"], "synthetic-contact-other"],
    [["profileId"], "synthetic-profile-other"],
    [["version"], 2],
    [["configurationId"], "synthetic-configuration-other"],
    [["configurationDigest"], "0".repeat(64)],
    [["configurationRevision"], 2],
    [["prospectRevision"], 2],
    [["contactRevision"], 2],
    [["contactEligibilitySnapshotId"], "synthetic-eligibility-other"],
    [["snapshot", "evidenceDigests"], ["1".repeat(64)]],
    [["snapshot", "claimGuardrailDigests"], ["5".repeat(64)]],
    [["snapshot", "recommendedAngle"], "Another angle"],
    [["snapshot", "selectedRole"], "economic_buyer"],
    [["snapshot", "selectedContactPointDigests"], ["6".repeat(64)]],
    [["snapshot", "callScript"], "Another derived script."],
    [["snapshot", "draftMessageIds"], ["synthetic-message-a"]],
    [["bindings"], pureSyntheticBindings().map((binding) => binding.kind === "evidence" ? { ...binding, digest: "7".repeat(64) } : binding)],
  ];
  const seen = new Set([digest]);
  for (const [path, value] of edits) {
    const changed = await packages.outreachPackageDigest(packages.canonicalOutreachPackage(setPath(draft, path, value)));
    assert.ok(!seen.has(changed), `${path.join(".")} must change the package digest`);
    seen.add(changed);
  }
  assert.equal(seen.size, edits.length + 1);

  // Unknown, secret-shaped, missing, or hostile fields fail closed.
  const rejected = [
    ["unknown top-level field", { ...draft, approved: true }],
    ["provider output", { ...draft, providerResponse: { id: "x" } }],
    ["secret-shaped field", { ...draft, snapshot: { ...draft.snapshot, accessToken: "redacted" } }],
    ["unknown binding field", { ...draft, bindings: [...draft.bindings.slice(1), { ...draft.bindings[0], note: "x" }] }],
    ["unknown binding kind", { ...draft, bindings: [...draft.bindings, { kind: "mailbox", id: "synthetic-mailbox", digest: "8".repeat(64) }] }],
    ["missing required binding", { ...draft, bindings: draft.bindings.filter((binding) => binding.kind !== "review_decision") }],
    ["duplicate binding", { ...draft, bindings: [...draft.bindings, draft.bindings[0]] }],
    ["missing snapshot field", { ...draft, snapshot: { ...draft.snapshot, callScript: undefined } }],
    ["duplicate evidence digest", setPath(draft, ["snapshot", "evidenceDigests"], ["1".repeat(64), "1".repeat(64)])],
    ["non-digest", setPath(draft, ["configurationDigest"], "Z".repeat(64))],
    ["control character", setPath(draft, ["snapshot", "recommendedAngle"], "angle\u0000")],
    ["unsafe integer", setPath(draft, ["version"], 1.5)],
    ["class instance", { ...draft, snapshot: Object.assign(Object.create({ inherited: true }), draft.snapshot) }],
  ];
  for (const [label, value] of rejected) {
    assert.throws(() => packages.canonicalOutreachPackage(value), packages.OutreachArtifactInputError, label);
  }
  let reads = 0;
  const accessor = { ...draft };
  Object.defineProperty(accessor, "recommendedAngle", { enumerable: true, get() { reads += 1; return "x"; } });
  assert.throws(() => packages.canonicalOutreachPackage(accessor), packages.OutreachArtifactInputError);
  assert.equal(reads, 0, "accessors are never invoked");
});

test("message canonicalization binds every deliverable field and normalizes recipients", async () => {
  const { messages } = modules;
  assert.deepEqual([...messages.MESSAGE_SNAPSHOT_FIELDS].sort(), [
    "attachments", "bcc", "cc", "from", "htmlBody", "links", "replyTo", "replyToMessageReference",
    "senderReference", "subject", "textBody", "threadReference", "to",
  ]);
  const packageDigest = "a".repeat(64);
  const draft = pureSyntheticMessageDraft();
  const canonical = messages.canonicalMessageVersion(draft, packageDigest);
  assert.equal(canonical.schema, "outreach-message-version/v1");
  assert.deepEqual(canonical.bindings, [{ kind: "package_version", id: draft.packageVersionId, digest: packageDigest }]);
  const digest = await messages.messageVersionDigest(canonical);

  // Recipient case, whitespace, and set order normalize to the same artifact.
  const spelled = setPath(setPath(draft, ["snapshot", "to"], ["  Verified@Example.INVALID "]), ["snapshot", "from"], "Owner@Example.invalid");
  assert.equal(await messages.messageVersionDigest(messages.canonicalMessageVersion(spelled, packageDigest)), digest);
  const multi = setPath(draft, ["snapshot", "cc"], ["b@example.invalid", "a@example.invalid"]);
  const multiReordered = setPath(draft, ["snapshot", "cc"], ["a@example.invalid", "B@example.invalid"]);
  assert.equal(
    await messages.messageVersionDigest(messages.canonicalMessageVersion(multi, packageDigest)),
    await messages.messageVersionDigest(messages.canonicalMessageVersion(multiReordered, packageDigest)),
  );

  const attachment = { id: "synthetic-attachment", name: "brief.pdf", mediaType: "application/pdf", digest: "8".repeat(64) };
  const edits = [
    [["messageId"], "synthetic-message-b"],
    [["packageId"], "synthetic-package-other"],
    [["packageVersionId"], "synthetic-package-version-2"],
    [["version"], 2],
    [["snapshot", "senderReference"], "sender-synthetic-alias"],
    [["snapshot", "from"], "alias@example.invalid"],
    [["snapshot", "replyTo"], "replies@example.invalid"],
    [["snapshot", "to"], ["other@example.invalid"]],
    [["snapshot", "cc"], ["cc@example.invalid"]],
    [["snapshot", "bcc"], ["bcc@example.invalid"]],
    [["snapshot", "subject"], "Another subject"],
    [["snapshot", "textBody"], "Another text body."],
    [["snapshot", "htmlBody"], "<p>Synthetic</p>"],
    [["snapshot", "links"], ["https://example.invalid/unsubscribe", "https://example.invalid/proof"]],
    [["snapshot", "attachments"], [attachment]],
    [["snapshot", "threadReference"], "thread-synthetic"],
    [["snapshot", "replyToMessageReference"], "message-reference-synthetic"],
    [["intendedSendAt"], OUTREACH_NOW + 2_000],
    [["timezone"], "Europe/London"],
    [["unsubscribeTokenDigest"], "7".repeat(64)],
  ];
  const seen = new Set([digest]);
  for (const [path, value] of edits) {
    const changed = await messages.messageVersionDigest(messages.canonicalMessageVersion(setPath(draft, path, value), packageDigest));
    assert.ok(!seen.has(changed), `${path.join(".")} must change the message digest`);
    seen.add(changed);
  }
  const otherPackage = await messages.messageVersionDigest(messages.canonicalMessageVersion(draft, "b".repeat(64)));
  assert.ok(!seen.has(otherPackage), "the exact package version digest is bound");
  // Link order is meaningful.
  const ordered = setPath(draft, ["snapshot", "links"], ["https://example.invalid/a", "https://example.invalid/b"]);
  const swapped = setPath(draft, ["snapshot", "links"], ["https://example.invalid/b", "https://example.invalid/a"]);
  assert.notEqual(
    await messages.messageVersionDigest(messages.canonicalMessageVersion(ordered, packageDigest)),
    await messages.messageVersionDigest(messages.canonicalMessageVersion(swapped, packageDigest)),
  );

  const rejected = [
    ["unknown field", { ...draft, approvedBy: "owner" }],
    ["provider message id", { ...draft, snapshot: { ...draft.snapshot, providerMessageId: "x" } }],
    ["secret-shaped field", { ...draft, snapshot: { ...draft.snapshot, refreshToken: "redacted" } }],
    ["plain-http link", setPath(draft, ["snapshot", "links"], ["http://example.invalid/x"])],
    ["link with credentials", setPath(draft, ["snapshot", "links"], ["https://user:pass@example.invalid/x"])],
    ["non-web link", setPath(draft, ["snapshot", "links"], ["javascript:alert(1)"])],
    ["header injection in subject", setPath(draft, ["snapshot", "subject"], "Hello\r\nBcc: x@example.invalid")],
    ["recipient in two lists", setPath(draft, ["snapshot", "cc"], ["verified@example.invalid"])],
    ["duplicate recipient", setPath(draft, ["snapshot", "to"], ["a@example.invalid", "A@example.invalid"])],
    ["no recipient", setPath(draft, ["snapshot", "to"], [])],
    ["malformed mailbox", setPath(draft, ["snapshot", "from"], "not-a-mailbox")],
    ["unknown timezone", setPath(draft, ["timezone"], "Mars/Olympus_Mons")],
    ["duplicate attachment", setPath(draft, ["snapshot", "attachments"], [attachment, attachment])],
    ["bad package digest", null],
  ];
  for (const [label, value] of rejected) {
    assert.throws(
      () => messages.canonicalMessageVersion(value ?? draft, value === null ? "nope" : packageDigest),
      modules.packages.OutreachArtifactInputError,
      label,
    );
  }
});

test("rescheduling is a version-only edit with a new digest", async () => {
  const { messages } = modules;
  const draft = Object.freeze(pureSyntheticMessageDraft());
  const rescheduled = messages.rescheduleMessageDraft(draft, { intendedSendAt: OUTREACH_NOW + 86_400_000, timezone: "America/Vancouver" });
  assert.equal(rescheduled.version, 2);
  assert.equal(draft.version, 1, "the reviewed draft is not mutated");
  assert.equal(rescheduled.snapshot.subject, draft.snapshot.subject);
  const before = await messages.messageVersionDigest(messages.canonicalMessageVersion(draft, "a".repeat(64)));
  const afterDigest = await messages.messageVersionDigest(messages.canonicalMessageVersion(rescheduled, "a".repeat(64)));
  assert.notEqual(afterDigest, before);
  // Same time and timezone with only the version bumped is still a distinct version.
  const sameTime = messages.rescheduleMessageDraft(draft, { intendedSendAt: draft.intendedSendAt, timezone: draft.timezone });
  assert.equal(sameTime, null, "a reschedule that changes nothing is refused");
  assert.throws(() => messages.rescheduleMessageDraft(draft, { intendedSendAt: OUTREACH_NOW, timezone: "America/Toronto", subject: "x" }), modules.packages.OutreachArtifactInputError);
});

test("package approval expiry defaults to 30 days and is configurable within bounds", () => {
  const { packages } = modules;
  assert.equal(packages.packageApprovalExpiresAt(OUTREACH_NOW), OUTREACH_NOW + 30 * DAY_MS);
  assert.equal(packages.packageApprovalExpiresAt(OUTREACH_NOW, 7 * DAY_MS), OUTREACH_NOW + 7 * DAY_MS);
  for (const ttl of [0, -1, 1.5, packages.MIN_APPROVAL_TTL_MS - 1, packages.MAX_APPROVAL_TTL_MS + 1, Number.NaN, "30"]) {
    assert.throws(() => packages.packageApprovalExpiresAt(OUTREACH_NOW, ttl), RangeError, String(ttl));
  }
  assert.throws(() => packages.packageApprovalExpiresAt(0), RangeError);
});

test("dependency, expiry, revocation, supersession, and contact changes invalidate package approval", () => {
  const { packages } = modules;
  const bindings = pureSyntheticBindings();
  const readyRecheck = syntheticEligibilityPort("synthetic-observation").port.recheckForPackageApproval({});
  const base = {
    now: OUTREACH_NOW,
    approval: { packageVersionId: "synthetic-package-version", artifactDigest: "9".repeat(64), expiresAt: OUTREACH_NOW + DAY_MS, revoked: false },
    version: { id: "synthetic-package-version", version: 1, artifactDigest: "9".repeat(64), bindings },
    latestVersion: 1,
    currentDependencies: bindings,
    contactRecheck: readyRecheck,
  };
  const current = packages.projectPackageApproval(base);
  assert.deepEqual({ ...current, reasonCodes: [...current.reasonCodes] }, {
    state: "current", crmEligible: true, messageSendAuthority: false, reasonCodes: [],
  });

  const cases = [
    ["expired", { ...base, now: OUTREACH_NOW + DAY_MS }, "approval_expired"],
    ["revoked", { ...base, approval: { ...base.approval, revoked: true } }, "approval_revoked"],
    ["digest drift", { ...base, approval: { ...base.approval, artifactDigest: "8".repeat(64) } }, "approval_digest_mismatch"],
    ["superseded", { ...base, latestVersion: 2 }, "superseded_by_newer_version"],
    ["missing approval", { ...base, approval: null }, "approval_missing"],
    ["contact blocked by production gate", { ...base, contactRecheck: modules.eligibility.recheckForPackageApproval({}) }, "contact_recheck_blocked"],
    ["weak contact", { ...base, contactRecheck: syntheticEligibilityPort("synthetic-observation", { pointState: "suggestion" }).port.recheckForPackageApproval({}) }, "contact_point_suggestion"],
    ["stale contact", { ...base, contactRecheck: syntheticEligibilityPort("synthetic-observation", { pointState: "stale" }).port.recheckForPackageApproval({}) }, "contact_point_stale"],
    ["unselected contact", { ...base, contactRecheck: syntheticEligibilityPort("other-observation").port.recheckForPackageApproval({}) }, "contact_point_missing"],
    ["wrong boundary", { ...base, contactRecheck: syntheticEligibilityPort("synthetic-observation", { boundary: "final_send" }).port.recheckForPackageApproval({}) }, "contact_recheck_wrong_boundary"],
    ["no recheck", { ...base, contactRecheck: null }, "contact_recheck_unavailable"],
    ["added dependency", { ...base, currentDependencies: [...bindings, { kind: "evidence", id: "synthetic-evidence-new", digest: "6".repeat(64) }] }, "dependency_added:evidence"],
  ];
  for (const binding of bindings) {
    cases.push([
      `${binding.kind} changed`,
      { ...base, currentDependencies: bindings.map((item) => item === binding ? { ...item, digest: "0".repeat(64) } : item) },
      `dependency_changed:${binding.kind}`,
    ]);
    cases.push([
      `${binding.kind} withdrawn`,
      { ...base, currentDependencies: bindings.filter((item) => item !== binding) },
      `dependency_missing:${binding.kind}`,
    ]);
  }
  for (const [label, input, reason] of cases) {
    const projection = packages.projectPackageApproval(input);
    assert.equal(projection.crmEligible, false, label);
    assert.equal(projection.messageSendAuthority, false, label);
    assert.ok(projection.reasonCodes.includes(reason), `${label}: expected ${reason}, got ${projection.reasonCodes.join(",")}`);
    assert.notEqual(projection.state, "current", label);
  }
});

test("production composition wires the always-refusing contact-eligibility recheck", () => {
  const { packages, messages, eligibility } = modules;
  assert.equal(packages.PRODUCTION_PACKAGE_ELIGIBILITY_PORT.recheckForPackageApproval, eligibility.recheckForPackageApproval);
  assert.ok(Object.isFrozen(packages.PRODUCTION_PACKAGE_ELIGIBILITY_PORT));
  const evidence = syntheticContactEvidence({ prospectId: "p-1", configurationId: "c-1", configurationDigest: "a".repeat(64) });
  const recheck = packages.PRODUCTION_PACKAGE_ELIGIBILITY_PORT.recheckForPackageApproval({ ...evidence, now: OUTREACH_NOW });
  assert.equal(recheck.blocked, true);
  // The production composers accept no eligibility, MailPort, or outbox override.
  const database = { prepare() { throw new Error("unused"); }, batch() { throw new Error("unused"); } };
  const options = { workspaceId: "w-synthetic", ownerSubject: "o-synthetic" };
  for (const extra of [{ eligibility: {} }, { mailPort: {} }, { outbox: {} }]) {
    assert.throws(() => packages.composeOutreachPackageService(database, options, extra), TypeError);
    assert.throws(() => messages.composeMessageVersionService(database, options, extra), TypeError);
  }
  // Service factories refuse a MailPort or outbox dependency outright.
  const deps = { repository: {}, reader: {}, eligibility: packages.PRODUCTION_PACKAGE_ELIGIBILITY_PORT, now: () => OUTREACH_NOW };
  assert.throws(() => packages.createOutreachPackageService({ ...deps, mailPort: { send() {} } }), TypeError);
  assert.throws(() => packages.createOutreachPackageService({ ...deps, eligibility: {} }), TypeError);
});

test("package versions, approvals, invalidation, and idempotency over the D1 repository", async () => {
  const fixture = await createD1Fixture("outreach-artifacts-package");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const { packages, repository: repositoryModule } = await loadArtifactModules(fixture.vite);
    const repository = repositoryModule.createD1OutreachRepository(fixture.database, scope(seeded));
    const reader = packages.createD1OutreachArtifactReader(fixture.database, scope(seeded));
    const ready = syntheticEligibilityPort(seeded.observationId);
    const service = packages.createOutreachPackageService({ repository, reader, eligibility: ready.port, now: () => OUTREACH_NOW });
    const evidence = syntheticContactEvidence(seeded);
    const dependencies = seededBindings(seeded);

    // Create: the service digest is exactly the persisted artifact digest.
    const draft = seededPackageDraft(seeded);
    const created = await service.createVersion({ draft, idempotencyKey: "artifact-package-v1" });
    assert.equal(created.kind, "created");
    assert.equal(created.digest, await packages.outreachPackageDigest(packages.canonicalOutreachPackage(draft)));
    const stored = await fixture.database.prepare("SELECT artifact_digest FROM outreach_package_versions WHERE id=?").bind(created.id).first();
    assert.equal(stored.artifact_digest, created.digest);
    const replay = await service.createVersion({ draft, idempotencyKey: "artifact-package-v1" });
    assert.deepEqual([replay.kind, replay.id, replay.digest, replay.replayed], ["created", created.id, created.digest, true]);

    // Idempotency conflict: same key, different canonical content.
    const conflicting = await service.createVersion({ draft: setPath(draft, ["snapshot", "recommendedAngle"], "Different angle"), idempotencyKey: "artifact-package-v1" });
    assert.deepEqual([conflicting.kind, [...conflicting.reasonCodes]], ["refused", ["idempotency_conflict"]]);
    const invalid = await service.createVersion({ draft: { ...draft, accessToken: "x" }, idempotencyKey: "artifact-package-invalid" });
    assert.deepEqual([invalid.kind, [...invalid.reasonCodes]], ["refused", ["invalid_package_input"]]);
    assert.equal(await countRows(fixture.database, "outreach_package_versions"), 1);
    assert.equal(await countRows(fixture.database, "outreach_commands"), 1);

    // Production composition always refuses: the existing recheck blocks.
    const production = packages.composeOutreachPackageService(fixture.database, scope(seeded));
    const productionRefusal = await production.approve({
      packageVersionId: created.id, reviewedDigest: created.digest, currentDependencies: dependencies,
      contactEvidence: evidence, idempotencyKey: "artifact-package-approval-production",
    });
    assert.equal(productionRefusal.kind, "refused");
    assert.ok(productionRefusal.reasonCodes.includes("contact_recheck_blocked"));

    // Weak and stale contacts are refused through the injected port.
    for (const pointState of ["suggestion", "stale"]) {
      const weak = packages.createOutreachPackageService({ repository, reader, eligibility: syntheticEligibilityPort(seeded.observationId, { pointState }).port, now: () => OUTREACH_NOW });
      const refused = await weak.approve({ packageVersionId: created.id, reviewedDigest: created.digest, currentDependencies: dependencies, contactEvidence: evidence, idempotencyKey: `artifact-package-approval-${pointState}` });
      assert.equal(refused.kind, "refused", pointState);
      assert.ok(refused.reasonCodes.includes(`contact_point_${pointState}`), pointState);
    }
    // Exact digest and current dependencies are required.
    const wrongDigest = await service.approve({ packageVersionId: created.id, reviewedDigest: "0".repeat(64), currentDependencies: dependencies, contactEvidence: evidence, idempotencyKey: "artifact-package-approval-wrong-digest" });
    assert.ok(wrongDigest.reasonCodes.includes("reviewed_digest_mismatch"));
    const drifted = await service.approve({
      packageVersionId: created.id, reviewedDigest: created.digest,
      currentDependencies: dependencies.map((binding) => binding.kind === "claim_guardrail" ? { ...binding, digest: "0".repeat(64) } : binding),
      contactEvidence: evidence, idempotencyKey: "artifact-package-approval-drifted",
    });
    assert.ok(drifted.reasonCodes.includes("dependency_changed:claim_guardrail"));
    assert.equal(await countRows(fixture.database, "outreach_package_approvals"), 0, "no refusal writes an approval");
    assert.equal(await countRows(fixture.database, "outreach_audit_records"), 1);

    // Approve: CRM eligibility only, 30-day default expiry, zero send effects.
    const approved = await service.approve({ packageVersionId: created.id, reviewedDigest: created.digest, currentDependencies: dependencies, contactEvidence: evidence, idempotencyKey: "artifact-package-approval" });
    assert.equal(approved.kind, "approved");
    assert.equal(approved.authority, "crm_eligibility_only");
    assert.equal(approved.expiresAt, OUTREACH_NOW + 30 * DAY_MS);
    assert.deepEqual(approved.effects, { outboxItems: 0, mailPortCalls: 0, messageApprovals: 0 });
    const recheckInput = ready.calls.at(-1);
    assert.deepEqual(recheckInput.target, { workspaceId: seeded.workspaceId, prospectId: seeded.prospectId, contactId: seeded.contactId });
    assert.equal(recheckInput.now, OUTREACH_NOW);
    const approvalRow = await fixture.database.prepare("SELECT expires_at,artifact_digest FROM outreach_package_approvals WHERE id=?").bind(approved.approvalId).first();
    assert.deepEqual([approvalRow.expires_at, approvalRow.artifact_digest], [OUTREACH_NOW + 30 * DAY_MS, created.digest]);
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);
    for (const table of NO_SEND_TABLES) assert.equal(await countRows(fixture.database, table), 0, `${table} stays empty`);

    // Replay returns the original approval; key reuse for another target conflicts.
    const approvalReplay = await service.approve({ packageVersionId: created.id, reviewedDigest: created.digest, currentDependencies: dependencies, contactEvidence: evidence, idempotencyKey: "artifact-package-approval" });
    assert.deepEqual([approvalReplay.kind, approvalReplay.approvalId, approvalReplay.replayed], ["approved", approved.approvalId, true]);
    const keyReuse = await service.createVersion({ draft: setPath(draft, ["version"], 2), idempotencyKey: "artifact-package-approval" });
    assert.deepEqual([...keyReuse.reasonCodes], ["idempotency_conflict"]);

    // Projection: current, then invalidated by a dependency change, contact staleness, or expiry.
    const projection = await service.projectApproval({ packageApprovalId: approved.approvalId, currentDependencies: dependencies, contactEvidence: evidence });
    assert.deepEqual([projection.state, projection.crmEligible, projection.messageSendAuthority], ["current", true, false]);
    const sourceWithdrawn = await service.projectApproval({ packageApprovalId: approved.approvalId, currentDependencies: dependencies.filter((binding) => binding.kind !== "source"), contactEvidence: evidence });
    assert.deepEqual([sourceWithdrawn.crmEligible, sourceWithdrawn.reasonCodes.includes("dependency_missing:source")], [false, true]);
    const later = packages.createOutreachPackageService({ repository, reader, eligibility: ready.port, now: () => OUTREACH_NOW + 30 * DAY_MS });
    const expired = await later.projectApproval({ packageApprovalId: approved.approvalId, currentDependencies: dependencies, contactEvidence: evidence });
    assert.ok(expired.reasonCodes.includes("approval_expired"));

    // Version-only edit: a revision is a new immutable version and supersedes the approval.
    const unchanged = await service.reviseVersion({ previousVersionId: created.id, changes: {}, idempotencyKey: "artifact-package-v2-unchanged" });
    assert.deepEqual([...unchanged.reasonCodes], ["unchanged_package"]);
    const identity = await service.reviseVersion({ previousVersionId: created.id, changes: { contactId: "other-contact" }, idempotencyKey: "artifact-package-v2-identity" });
    assert.deepEqual([...identity.reasonCodes], ["package_identity_immutable"]);
    const revised = await service.reviseVersion({ previousVersionId: created.id, changes: { snapshot: { recommendedAngle: "Revised synthetic angle" } }, idempotencyKey: "artifact-package-v2" });
    assert.equal(revised.kind, "created");
    assert.equal(revised.version, 2);
    assert.notEqual(revised.digest, created.digest);
    const original = await fixture.database.prepare("SELECT snapshot_json FROM outreach_package_versions WHERE id=?").bind(created.id).first();
    assert.equal(JSON.parse(original.snapshot_json).recommendedAngle, "Synthetic governed outreach angle", "version 1 is untouched");
    const superseded = await service.projectApproval({ packageApprovalId: approved.approvalId, currentDependencies: dependencies, contactEvidence: evidence });
    assert.deepEqual([superseded.crmEligible, superseded.reasonCodes.includes("superseded_by_newer_version")], [false, true]);
    const staleBase = await service.reviseVersion({ previousVersionId: created.id, changes: { snapshot: { callScript: "Another script." } }, idempotencyKey: "artifact-package-v3-stale" });
    assert.deepEqual([...staleBase.reasonCodes], ["stale_base_version"]);
    const staleApproval = await service.approve({ packageVersionId: created.id, reviewedDigest: created.digest, currentDependencies: dependencies, contactEvidence: evidence, idempotencyKey: "artifact-package-approval-v1-again" });
    assert.ok(staleApproval.reasonCodes.includes("superseded_by_newer_version"));

    // Version 2 requires its own exact approval.
    const approvedV2 = await service.approve({ packageVersionId: revised.id, reviewedDigest: revised.digest, currentDependencies: dependencies, contactEvidence: evidence, idempotencyKey: "artifact-package-approval-v2" });
    assert.equal(approvedV2.kind, "approved");
    assert.notEqual(approvedV2.approvalId, approved.approvalId);
    assert.equal(await countRows(fixture.database, "outreach_package_approvals"), 2);
    for (const table of [...NO_SEND_TABLES, "outreach_message_approvals"]) assert.equal(await countRows(fixture.database, table), 0, `${table} stays empty`);

    // Cross-workspace reads see nothing.
    const foreign = packages.createD1OutreachArtifactReader(fixture.database, { workspaceId: seeded.workspaceId, ownerSubject: "someone-else" });
    assert.equal(await foreign.readPackageVersion(created.id), null);
  } finally {
    await fixture.dispose();
  }
});

test("message versions are exact, independently approved, and rescheduling demands new approval", async () => {
  const fixture = await createD1Fixture("outreach-artifacts-message");
  try {
    const seeded = await seedOutreachAuthority(fixture);
    const { packages, messages, repository: repositoryModule } = await loadArtifactModules(fixture.vite);
    const repository = repositoryModule.createD1OutreachRepository(fixture.database, scope(seeded));
    const reader = packages.createD1OutreachArtifactReader(fixture.database, scope(seeded));
    const ready = syntheticEligibilityPort(seeded.observationId);
    const packageService = packages.createOutreachPackageService({ repository, reader, eligibility: ready.port, now: () => OUTREACH_NOW });
    const service = messages.createMessageVersionService({ repository, reader, packages: packageService, now: () => OUTREACH_NOW });
    const evidence = syntheticContactEvidence(seeded);
    const dependencies = seededBindings(seeded);

    const packageVersion = await packageService.createVersion({ draft: seededPackageDraft(seeded), idempotencyKey: "artifact-message-package-v1" });
    const packageApproval = await packageService.approve({ packageVersionId: packageVersion.id, reviewedDigest: packageVersion.digest, currentDependencies: dependencies, contactEvidence: evidence, idempotencyKey: "artifact-message-package-approval" });
    assert.equal(packageApproval.kind, "approved");

    // Create two independent messages; digests equal the persisted artifacts.
    const draftA = seededMessageDraft(packageVersion);
    const messageA = await service.createVersion({ draft: draftA, configurationId: seeded.configurationId, idempotencyKey: "artifact-message-a-v1" });
    assert.equal(messageA.kind, "created");
    assert.equal(messageA.digest, await messages.messageVersionDigest(messages.canonicalMessageVersion(draftA, packageVersion.digest)));
    const draftB = seededMessageDraft(packageVersion, { messageId: "artifact-message-b", unsubscribeTokenDigest: "8".repeat(64), snapshot: { ...draftA.snapshot, subject: "A second synthetic message" } });
    const messageB = await service.createVersion({ draft: draftB, configurationId: seeded.configurationId, idempotencyKey: "artifact-message-b-v1" });
    assert.equal(messageB.kind, "created");
    const wrongConfiguration = await service.createVersion({ draft: { ...draftA, messageId: "artifact-message-c", unsubscribeTokenDigest: "7".repeat(64) }, configurationId: "other-configuration", idempotencyKey: "artifact-message-c-v1" });
    assert.deepEqual([...wrongConfiguration.reasonCodes], ["configuration_mismatch"]);
    const messageConflict = await service.createVersion({ draft: setPath(draftA, ["snapshot", "subject"], "Edited under the same key"), configurationId: seeded.configurationId, idempotencyKey: "artifact-message-a-v1" });
    assert.deepEqual([...messageConflict.reasonCodes], ["idempotency_conflict"]);

    const validUntil = OUTREACH_NOW + 20_000;
    const approveA = (overrides = {}) => service.approve({
      messageVersionId: messageA.id, reviewedDigest: messageA.digest, packageApprovalId: packageApproval.approvalId,
      acknowledgementDigest: overrides.acknowledgementDigest, currentDependencies: dependencies, contactEvidence: evidence,
      idempotencyKey: "artifact-message-a-approval", ...overrides,
    });
    // Without an owner acknowledgement-bearing recipient authority, approval is refused.
    const unacknowledged = await approveA({ acknowledgementDigest: "1".repeat(64) });
    assert.ok(unacknowledged.reasonCodes.includes("acknowledgement_missing"));
    const authorityA = await recordRecipientAuthority(repository, messageA.id, packageApproval.approvalId, seeded, validUntil);
    const wrongDigest = await approveA({ acknowledgementDigest: authorityA.digest, reviewedDigest: messageB.digest });
    assert.ok(wrongDigest.reasonCodes.includes("reviewed_digest_mismatch"));
    // Production composition refuses: package authority rechecks through the blocked gate.
    const production = messages.composeMessageVersionService(fixture.database, scope(seeded));
    const productionRefusal = await production.approve({
      messageVersionId: messageA.id, reviewedDigest: messageA.digest, packageApprovalId: packageApproval.approvalId,
      acknowledgementDigest: authorityA.digest, currentDependencies: dependencies, contactEvidence: evidence,
      idempotencyKey: "artifact-message-a-approval-production",
    });
    assert.ok(productionRefusal.reasonCodes.includes("package_approval_not_current"));
    assert.ok(productionRefusal.reasonCodes.includes("contact_recheck_blocked"));
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 0);

    const approvedA = await approveA({ acknowledgementDigest: authorityA.digest });
    assert.equal(approvedA.kind, "approved");
    assert.equal(approvedA.authority, "exact_message_only");
    assert.equal(approvedA.expiresAt, validUntil, "message approval is capped by its acknowledged recipient authority");
    assert.deepEqual(approvedA.effects, { outboxItems: 0, mailPortCalls: 0, approvalConsumptions: 0 });
    const replay = await approveA({ acknowledgementDigest: authorityA.digest });
    assert.deepEqual([replay.approvalId, replay.replayed], [approvedA.approvalId, true]);

    // Independence: message B has no approval from A's approval and conflicts on A's key.
    const reusedKey = await service.approve({
      messageVersionId: messageB.id, reviewedDigest: messageB.digest, packageApprovalId: packageApproval.approvalId,
      acknowledgementDigest: authorityA.digest, currentDependencies: dependencies, contactEvidence: evidence,
      idempotencyKey: "artifact-message-a-approval",
    });
    assert.deepEqual([...reusedKey.reasonCodes], ["idempotency_conflict"]);
    const crossAcknowledged = await service.approve({
      messageVersionId: messageB.id, reviewedDigest: messageB.digest, packageApprovalId: packageApproval.approvalId,
      acknowledgementDigest: authorityA.digest, currentDependencies: dependencies, contactEvidence: evidence,
      idempotencyKey: "artifact-message-b-approval",
    });
    assert.ok(crossAcknowledged.reasonCodes.includes("acknowledgement_missing"), "A's acknowledgement cannot approve B");
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 1);
    const authorityB = await recordRecipientAuthority(repository, messageB.id, packageApproval.approvalId, seeded, validUntil);
    const approvedB = await service.approve({
      messageVersionId: messageB.id, reviewedDigest: messageB.digest, packageApprovalId: packageApproval.approvalId,
      acknowledgementDigest: authorityB.digest, currentDependencies: dependencies, contactEvidence: evidence,
      idempotencyKey: "artifact-message-b-approval",
    });
    assert.equal(approvedB.kind, "approved");
    assert.notEqual(approvedB.approvalDigest, approvedA.approvalDigest);
    assert.equal(await countRows(fixture.database, "outreach_message_approvals"), 2);

    // Reschedule: a new version with a new digest; the old approval does not carry over.
    const sameSchedule = await service.reschedule({ previousVersionId: messageA.id, intendedSendAt: OUTREACH_NOW + 1_000, timezone: "America/Toronto", unsubscribeTokenDigest: "6".repeat(64), idempotencyKey: "artifact-message-a-v2-same" });
    assert.deepEqual([...sameSchedule.reasonCodes], ["unchanged_schedule"]);
    const reusedToken = await service.reschedule({ previousVersionId: messageA.id, intendedSendAt: OUTREACH_NOW + 5_000, timezone: "America/Vancouver", unsubscribeTokenDigest: draftA.unsubscribeTokenDigest, idempotencyKey: "artifact-message-a-v2-token" });
    assert.deepEqual([...reusedToken.reasonCodes], ["unsubscribe_token_reused"]);
    const rescheduled = await service.reschedule({ previousVersionId: messageA.id, intendedSendAt: OUTREACH_NOW + 5_000, timezone: "America/Vancouver", unsubscribeTokenDigest: "6".repeat(64), idempotencyKey: "artifact-message-a-v2" });
    assert.equal(rescheduled.kind, "created");
    assert.equal(rescheduled.version, 2);
    assert.notEqual(rescheduled.digest, messageA.digest);
    const stored = await fixture.database.prepare("SELECT intended_send_at,timezone FROM outreach_message_versions WHERE id=?").bind(messageA.id).first();
    assert.deepEqual([stored.intended_send_at, stored.timezone], [OUTREACH_NOW + 1_000, "America/Toronto"], "version 1 is untouched");
    const storedV2 = await fixture.database.prepare("SELECT intended_send_at,timezone,version FROM outreach_message_versions WHERE id=?").bind(rescheduled.id).first();
    assert.deepEqual([storedV2.intended_send_at, storedV2.timezone, storedV2.version], [OUTREACH_NOW + 5_000, "America/Vancouver", 2]);
    const noApprovalYet = await fixture.database.prepare("SELECT count(*) count FROM outreach_message_approvals WHERE message_version_id=?").bind(rescheduled.id).first();
    assert.equal(noApprovalYet.count, 0);
    const oldAuthorityOnNew = await service.approve({
      messageVersionId: rescheduled.id, reviewedDigest: rescheduled.digest, packageApprovalId: packageApproval.approvalId,
      acknowledgementDigest: authorityA.digest, currentDependencies: dependencies, contactEvidence: evidence,
      idempotencyKey: "artifact-message-a-v2-approval",
    });
    assert.ok(oldAuthorityOnNew.reasonCodes.includes("acknowledgement_missing"), "a reschedule needs a fresh acknowledgement");
    const supersededV1 = await approveA({ acknowledgementDigest: authorityA.digest, idempotencyKey: "artifact-message-a-v1-again" });
    assert.ok(supersededV1.reasonCodes.includes("superseded_by_newer_version"));
    const authorityA2 = await recordRecipientAuthority(repository, rescheduled.id, packageApproval.approvalId, seeded, validUntil);
    const approvedA2 = await service.approve({
      messageVersionId: rescheduled.id, reviewedDigest: rescheduled.digest, packageApprovalId: packageApproval.approvalId,
      acknowledgementDigest: authorityA2.digest, currentDependencies: dependencies, contactEvidence: evidence,
      idempotencyKey: "artifact-message-a-v2-approval",
    });
    assert.equal(approvedA2.kind, "approved");
    const editNoop = await service.reviseVersion({ previousVersionId: rescheduled.id, changes: {}, idempotencyKey: "artifact-message-a-v3-noop" });
    assert.deepEqual([...editNoop.reasonCodes], ["unchanged_message"]);

    // A message whose package approval is no longer current cannot be approved.
    const drifted = await service.approve({
      messageVersionId: messageB.id, reviewedDigest: messageB.digest, packageApprovalId: packageApproval.approvalId,
      acknowledgementDigest: authorityB.digest,
      currentDependencies: dependencies.map((binding) => binding.kind === "evidence" ? { ...binding, digest: "0".repeat(64) } : binding),
      contactEvidence: evidence, idempotencyKey: "artifact-message-b-approval-drifted",
    });
    assert.ok(drifted.reasonCodes.includes("package_approval_not_current"));

    for (const table of NO_SEND_TABLES) assert.equal(await countRows(fixture.database, table), 0, `${table} stays empty`);
    const audit = JSON.stringify((await fixture.database.prepare("SELECT * FROM outreach_audit_records").all()).results);
    assert.doesNotMatch(audit, /Hello from the offline fixture|verified@example\.invalid/u, "audit holds digests, not message content");
  } finally {
    await fixture.dispose();
  }
});
