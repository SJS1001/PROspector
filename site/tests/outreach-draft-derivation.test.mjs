import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

// 06-08 (local): the deterministic, evidence-bound Outreach draft derivation.
// Pure unit tests over synthetic references only. No AI/LLM or provider call
// exists, nothing is approved or sent, and the derivation input carries
// digests and references, never free text it could restate as a fact.

const root = new URL("../", import.meta.url);
const digest = (char) => char.repeat(64);
const RECIPIENT = "verified@example.invalid";
const SENDER = "owner@example.invalid";

async function withModules(assertion) {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const derivation = await vite.ssrLoadModule(new URL("domain/outreach-draft-derivation.ts", root).pathname);
    const packages = await vite.ssrLoadModule(new URL("domain/outreach-package.ts", root).pathname);
    const messages = await vite.ssrLoadModule(new URL("domain/message-version.ts", root).pathname);
    const suppression = await vite.ssrLoadModule(new URL("domain/suppression.ts", root).pathname);
    await assertion({ derivation, packages, messages, suppression });
  } finally { await vite.close(); }
}

async function evidence(suppression, overrides = {}) {
  return {
    prospectId: "draft-prospect", contactId: "draft-contact", profileId: "draft-profile",
    configuration: { id: "draft-configuration", digest: digest("1"), revision: 2 },
    prospectRevision: 3, contactRevision: 4,
    eligibility: { id: "draft-eligibility", digest: digest("2") },
    qualification: { id: "draft-assessment", digest: digest("3") },
    reviewDecision: { id: "draft-review", digest: digest("4") },
    evidence: [{ id: "draft-evidence", digest: digest("5"), sourceId: "draft-source" }],
    sources: [{ id: "draft-source", digest: digest("6") }],
    claimGuardrails: [{ id: "draft-guardrail", digest: digest("7") }],
    role: "champion",
    contactPoints: [
      { observationId: "draft-email-observation", observationDigest: digest("8"), contactPointDigest: await suppression.emailDigest(RECIPIENT), kind: "email" },
      { observationId: "draft-phone-observation", observationDigest: digest("9"), contactPointDigest: digest("a"), kind: "phone" },
    ],
    ...overrides,
  };
}

const OPTIONS = Object.freeze({ packageId: "draft-package", messageId: "draft-message", senderAddress: SENDER, recipientAddress: RECIPIENT });

test("the derivation is deterministic and produces drafts the existing canonical Package and Message validators accept", async () => {
  await withModules(async ({ derivation, packages, messages, suppression }) => {
    const input = await evidence(suppression);
    const first = await derivation.deriveOutreachDraft(input, OPTIONS);
    const second = await derivation.deriveOutreachDraft(structuredClone(input), { ...OPTIONS });
    assert.equal(first.kind, "derived", JSON.stringify(first));
    assert.deepEqual(first, second, "the same evidence derives the same drafts");
    assert.equal(first.templateVersion, "outreach-draft-template/v1");

    const canonical = packages.canonicalOutreachPackage(first.package);
    assert.equal(canonical.packageId, "draft-package");
    assert.equal(canonical.version, 1);
    assert.equal(canonical.contactEligibilitySnapshotId, "draft-eligibility");
    assert.deepEqual(canonical.snapshot.evidenceDigests, [digest("5")]);
    assert.deepEqual(canonical.snapshot.claimGuardrailDigests, [digest("7")]);
    assert.equal(canonical.snapshot.selectedRole, "champion");
    assert.equal(canonical.snapshot.selectedContactPointDigests.length, 2);
    assert.deepEqual(canonical.snapshot.draftMessageIds, ["draft-message"]);
    assert.deepEqual(
      canonical.bindings.map((binding) => binding.kind).sort(),
      ["claim_guardrail", "configuration", "contact_eligibility", "contact_observation", "contact_observation", "evidence", "qualification", "review_decision", "source"],
    );
    assert.equal(await packages.outreachPackageDigest(canonical), await packages.outreachPackageDigest(packages.canonicalOutreachPackage(second.package)));

    assert.equal(first.messages.length, 1);
    const [message] = first.messages;
    const canonicalMessage = messages.canonicalMessageVersion({
      messageId: message.messageId, packageId: "draft-package", packageVersionId: "draft-package-version", version: 1,
      snapshot: message.snapshot, intendedSendAt: message.intendedSendAt, timezone: message.timezone, unsubscribeTokenDigest: digest("b"),
    }, digest("c"));
    assert.deepEqual(canonicalMessage.snapshot.to, [RECIPIENT]);
    assert.equal(canonicalMessage.snapshot.from, SENDER);
    assert.deepEqual(canonicalMessage.snapshot.cc, []);
    assert.deepEqual(canonicalMessage.snapshot.bcc, []);
    assert.deepEqual(canonicalMessage.snapshot.links, [], "the draft carries no link");
    assert.deepEqual(canonicalMessage.snapshot.attachments, []);
    assert.equal(canonicalMessage.snapshot.htmlBody, null);
    assert.equal(canonicalMessage.intendedSendAt, null, "a draft is never scheduled");
  });
});

test("the package cites evidence, guardrails, qualification and review by reference only, and raw contact values stay out of every text", async () => {
  await withModules(async ({ derivation, suppression }) => {
    const result = await derivation.deriveOutreachDraft(await evidence(suppression), OPTIONS);
    const { recommendedAngle, callScript } = result.package.snapshot;
    for (const ref of [digest("5"), digest("7"), digest("3"), digest("4")]) {
      assert.ok(callScript.includes(ref.slice(0, 12)), `the call script cites ${ref.slice(0, 4)}… by reference`);
    }
    assert.match(recommendedAngle, /1 evidence reference/);
    assert.match(recommendedAngle, /1 confirmed Claim Guardrail/);
    assert.match(callScript, /PROspector does not place or record calls/);
    assert.match(callScript, /Claim Guardrail/);
    const message = result.messages[0].snapshot;
    for (const text of [recommendedAngle, callScript, message.subject, message.textBody]) {
      assert.equal(text.includes(RECIPIENT), false, "the recipient address appears only in the To field");
      assert.equal(text.includes(SENDER), false);
      assert.doesNotMatch(text, /\+\d{6,}|\(\d{3}\)|\d{3}[ .-]\d{3}[ .-]\d{4}/, "no phone number");
      assert.doesNotMatch(text, /tel:|mailto:|https?:\/\//i, "no dial, mail or web link");
      assert.doesNotMatch(text, /[0-9a-f]{64}/, "no full digest is restated");
    }
    assert.doesNotMatch(message.textBody, /evidence|guardrail|ref [0-9a-f]/i, "internal references stay out of the email body");
    assert.doesNotMatch(`${message.subject} ${message.textBody}`, /guarantee|increase|save|percent|%|\$|results/i, "the email states no product or outcome claim");
  });
});

test("the derivation input is closed: free text such as an excerpt, a name or a body is refused, so nothing can be restated as fact", async () => {
  await withModules(async ({ derivation, suppression }) => {
    const base = await evidence(suppression);
    for (const forged of [
      { ...base, excerpt: "Synthetic Co grew revenue 300%" },
      { ...base, evidence: [{ ...base.evidence[0], excerpt: "fabricated quote" }] },
      { ...base, claimGuardrails: [{ ...base.claimGuardrails[0], text: "We guarantee results" }] },
      { ...base, contactName: "Synthetic Contact" },
      { ...base, contactPoints: [{ ...base.contactPoints[0], value: RECIPIENT }] },
    ]) {
      const result = await derivation.deriveOutreachDraft(forged, OPTIONS);
      assert.equal(result.kind, "refused", JSON.stringify(Object.keys(forged)));
      assert.deepEqual(result.reasonCodes, ["invalid_draft_evidence"]);
    }
    const extraOption = await derivation.deriveOutreachDraft(base, { ...OPTIONS, textBody: "Hello" });
    assert.deepEqual(extraOption.reasonCodes, ["invalid_draft_evidence"]);
  });
});

test("missing evidence, guardrails, sources or contact points fail closed with a reason and derive nothing", async () => {
  await withModules(async ({ derivation, suppression }) => {
    const base = await evidence(suppression);
    const cases = [
      [{ evidence: [] }, "evidence_missing"],
      [{ claimGuardrails: [] }, "claim_guardrail_missing"],
      [{ sources: [] }, "source_missing"],
      [{ evidence: [{ ...base.evidence[0], sourceId: "other-source" }] }, "source_missing"],
      [{ contactPoints: [] }, "contact_point_missing"],
    ];
    for (const [patch, reason] of cases) {
      const result = await derivation.deriveOutreachDraft({ ...base, ...patch }, OPTIONS);
      assert.equal(result.kind, "refused", reason);
      assert.ok(result.reasonCodes.includes(reason), `${reason}: ${result.reasonCodes}`);
      assert.equal(result.package, undefined);
    }
  });
});

test("the recipient must be the owner's confirmation of a selected verified email point; a mismatch or a missing confirmation derives nothing", async () => {
  await withModules(async ({ derivation, suppression }) => {
    const base = await evidence(suppression);
    const missing = await derivation.deriveOutreachDraft(base, { ...OPTIONS, recipientAddress: null });
    assert.deepEqual(missing.reasonCodes, ["recipient_confirmation_required"]);
    for (const wrong of ["other@example.invalid", "not an address", "verified@example.invalid.evil"]) {
      const result = await derivation.deriveOutreachDraft(base, { ...OPTIONS, recipientAddress: wrong });
      assert.deepEqual(result.reasonCodes, ["recipient_confirmation_mismatch"], wrong);
    }
    const spelled = await derivation.deriveOutreachDraft(base, { ...OPTIONS, recipientAddress: "  Verified@Example.INVALID " });
    assert.equal(spelled.kind, "derived", "the confirmation is normalized before it is compared");
    assert.deepEqual(spelled.messages[0].snapshot.to, [RECIPIENT]);
    const noSender = await derivation.deriveOutreachDraft(base, { ...OPTIONS, senderAddress: "" });
    assert.deepEqual(noSender.reasonCodes, ["sender_address_unavailable"]);
  });
});

test("a phone-only contact derives a package with no email draft, and a confirmation without an email point is refused", async () => {
  await withModules(async ({ derivation, packages, suppression }) => {
    const base = await evidence(suppression);
    const phoneOnly = { ...base, contactPoints: [base.contactPoints[1]] };
    const result = await derivation.deriveOutreachDraft(phoneOnly, { ...OPTIONS, recipientAddress: null });
    assert.equal(result.kind, "derived");
    assert.deepEqual(result.messages, []);
    assert.deepEqual(packages.canonicalOutreachPackage(result.package).snapshot.draftMessageIds, []);
    const confirmed = await derivation.deriveOutreachDraft(phoneOnly, OPTIONS);
    assert.deepEqual(confirmed.reasonCodes, ["recipient_confirmation_mismatch"]);
  });
});

test("roles outside the package vocabulary become general, and the source file has no AI, provider, dial or mail path", async () => {
  await withModules(async ({ derivation, suppression }) => {
    const result = await derivation.deriveOutreachDraft(await evidence(suppression, { role: "decision_maker" }), OPTIONS);
    assert.equal(result.package.snapshot.selectedRole, "general");
  });
  const text = await readFile(new URL("domain/outreach-draft-derivation.ts", root), "utf8");
  assert.doesNotMatch(text, /tel:|mailto:/i);
  assert.doesNotMatch(text, /openrouter|anthropic|openai|\bllm\b|fetch\(|gmail\.googleapis\.com|GMAIL_[A-Z]/i, "no AI, provider or Gmail call");
  assert.doesNotMatch(text, /preparation\//, "no preparation-only code is composed");
  assert.doesNotMatch(text, /recheckFor/, "drafting never calls or replaces a Phase 5 recheck");
  assert.doesNotMatch(text, /approvePackageVersion|approveMessageVersion|enqueue|recordRecipientDispatchAuthority/, "drafting creates no approval, authority or queue item");
});

test("an address the message validator would reject derives nothing, so a Package is never created without its email draft", async () => {
  await withModules(async ({ derivation, suppression }) => {
    const base = await evidence(suppression);
    // normalizeExactEmail accepts this, but the Message Version mailbox rule does not.
    const result = await derivation.deriveOutreachDraft(base, { ...OPTIONS, senderAddress: "own(er)@example.invalid" });
    assert.equal(result.kind, "refused", JSON.stringify(result));
    assert.deepEqual(result.reasonCodes, ["draft_message_invalid"]);
    assert.equal(result.package, undefined, "no package is derived when its message would be refused");
  });
});

test("the fixed templates state no reason, relevance or review the evidence and Claim Guardrails have not established", async () => {
  await withModules(async ({ derivation, suppression }) => {
    const result = await derivation.deriveOutreachDraft(await evidence(suppression), OPTIONS);
    const { callScript } = result.package.snapshot;
    const { subject, textBody } = result.messages[0].snapshot;
    const UNBACKED = /public information|\bteam\b|relevan|suggest|reviewed|because|our work|your work/i;
    assert.doesNotMatch(`${subject}\n${textBody}`, UNBACKED, "the email asserts no fact of its own");
    const [reasonLine] = callScript.split("\n").filter((line) => line.startsWith("2. "));
    assert.ok(reasonLine, "the call script keeps a reason-for-calling step");
    assert.doesNotMatch(reasonLine, UNBACKED, "the call script supplies no reason of its own");
    assert.match(reasonLine, /Claim Guardrail G1/, "the reason for calling is limited to what the guardrails permit");
    assert.match(reasonLine, /cited evidence/);
  });
});
