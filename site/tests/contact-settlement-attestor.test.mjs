import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

const DIGESTS = Object.freeze({
  acknowledgement: "1".repeat(64),
  configuration: "2".repeat(64),
  observationA: "3".repeat(64),
  observationB: "4".repeat(64),
  receiptA: "5".repeat(64),
  receiptB: "6".repeat(64),
  requestA: "7".repeat(64),
  requestB: "8".repeat(64),
  settlement: "9".repeat(64),
  verdictA: "a".repeat(64),
  verdictB: "b".repeat(64),
});

let vite;
let attestation;
let runtime;

before(async () => {
  vite = await createServer({ configFile: false, logLevel: "silent" });
  attestation = await vite.ssrLoadModule(
    new URL("../domain/contact-settlement-attestor.ts", import.meta.url).pathname,
  );
  runtime = await vite.ssrLoadModule(
    new URL("../domain/contact-settlement-runtime.ts", import.meta.url).pathname,
  );
});

after(async () => {
  await vite?.close();
});

test("a bound nonextractable HMAC key signs and verifies one exact canonical settlement", async () => {
  const key = await hmacKey("active secret fixture", ["sign", "verify"]);
  const attestor = attestation.bindContactSettlementAttestor({
    active: { keyId: "contact-attestor-2026-07", key },
    verificationOnly: [],
  });

  assert.ok(attestor);
  assert.equal(attestation.isBoundContactSettlementAttestor(attestor), true);
  assert.equal(attestation.isBoundContactSettlementAttestor({
    kind: "contact_settlement_attestor",
    activeKeyId: "contact-attestor-2026-07",
    sign: attestor.sign,
    verify: attestor.verify,
  }), false);
  assert.deepEqual(
    Reflect.ownKeys(attestor).sort(),
    ["activeKeyId", "kind", "sign", "verificationKeyIds", "verify"],
    "the capability exposes no CryptoKey or key ring",
  );
  assert.deepEqual(attestor.verificationKeyIds, ["contact-attestor-2026-07"]);
  assert.equal(Object.isFrozen(attestor.verificationKeyIds), true);
  assert.equal(key.extractable, false);

  const signed = await attestor.sign(material());
  assert.ok(signed);
  assert.equal(Object.isFrozen(signed), true);
  assert.deepEqual(Object.keys(signed).sort(), [
    "algorithm",
    "keyId",
    "materialDigest",
    "schema",
    "tag",
  ]);
  assert.equal(signed.schema, "contact-verification-settlement-attestation-envelope/v1");
  assert.equal(signed.algorithm, "HMAC-SHA-256");
  assert.equal(signed.keyId, "contact-attestor-2026-07");
  assert.match(signed.materialDigest, /^[0-9a-f]{64}$/u);
  assert.match(signed.tag, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(attestor).includes("active secret fixture"), false);
  assert.equal(JSON.stringify(signed).includes("active secret fixture"), false);
  assert.equal(await attestor.verify(material(), JSON.parse(JSON.stringify(signed))), true);
});

test("an optional runtime key ring imports nonextractable keys and malformed or absent bindings stay reject-only", async () => {
  const activeBytes = new TextEncoder().encode("runtime active secret fixture 0001");
  const oldBytes = new TextEncoder().encode("runtime retained secret fixture 01");
  const encoded = (bytes) => btoa(String.fromCharCode(...bytes));
  const attestor = await runtime.bindRuntimeContactSettlementAttestor(JSON.stringify({
    active: { keyId: "runtime-active", keyBase64: encoded(activeBytes) },
    verificationOnly: [{ keyId: "runtime-old", keyBase64: encoded(oldBytes) }],
  }));
  assert.ok(attestor);
  assert.equal(attestation.isBoundContactSettlementAttestor(attestor), true);
  assert.ok(await attestor.sign(material()));
  assert.equal(await runtime.bindRuntimeContactSettlementAttestor(undefined), null);
  assert.equal(await runtime.bindRuntimeContactSettlementAttestor("{"), null);
  assert.equal(await runtime.bindRuntimeContactSettlementAttestor(JSON.stringify({
    active: { keyId: "runtime-active", keyBase64: encoded(new Uint8Array(8)) },
    verificationOnly: [],
  })), null);
});

test("verification accepts retained verification-only keys while signing only with the active key", async () => {
  const oldSigningKey = await hmacKey("old retained fixture", ["sign", "verify"]);
  const oldVerificationKey = await hmacKey("old retained fixture", ["verify"]);
  const newKey = await hmacKey("new active fixture", ["sign", "verify"]);
  const oldAttestor = attestation.bindContactSettlementAttestor({
    active: { keyId: "contact-attestor-old", key: oldSigningKey },
    verificationOnly: [],
  });
  const rotated = attestation.bindContactSettlementAttestor({
    active: { keyId: "contact-attestor-new", key: newKey },
    verificationOnly: [{ keyId: "contact-attestor-old", key: oldVerificationKey }],
  });
  assert.ok(oldAttestor);
  assert.ok(rotated);
  assert.deepEqual(rotated.verificationKeyIds, ["contact-attestor-new", "contact-attestor-old"], "only the sorted complete nonsecret verification identity is exposed");

  const oldEnvelope = await oldAttestor.sign(material());
  const newEnvelope = await rotated.sign(material());
  assert.ok(oldEnvelope);
  assert.ok(newEnvelope);
  assert.equal(oldEnvelope.keyId, "contact-attestor-old");
  assert.equal(newEnvelope.keyId, "contact-attestor-new");
  assert.equal(await rotated.verify(material(), oldEnvelope), true);
  assert.equal(await rotated.verify(material(), newEnvelope), true);
  assert.equal(await oldAttestor.verify(material(), newEnvelope), false);
});

test("verification fails closed for copied tags, unknown keys, malformed envelopes, and any material change", async () => {
  const key = await hmacKey("tamper fixture", ["sign", "verify"]);
  const attestor = attestation.bindContactSettlementAttestor({
    active: { keyId: "contact-attestor-tamper", key },
    verificationOnly: [],
  });
  assert.ok(attestor);
  const baseline = material();
  const signed = await attestor.sign(baseline);
  assert.ok(signed);

  const changes = [
    ["reservation", { ...baseline, reservationId: "reservation-other" }],
    ["contact", replaceReceipt(baseline, 0, { contactId: "contact-other" })],
    ["observation digest", replaceReceipt(baseline, 0, { observationDigest: "c".repeat(64) })],
    ["receipt digest", replaceReceiptAndDigest(baseline, 0, "d".repeat(64))],
    ["settlement digest", { ...baseline, settlementDigest: "e".repeat(64) }],
    ["revision", { ...baseline, durableRevision: baseline.durableRevision + 1 }],
    ["documented cost", { ...baseline, documentedCostMinor: baseline.documentedCostMinor + 1 }],
  ];
  for (const [name, changed] of changes) {
    assert.equal(await attestor.verify(changed, signed), false, name);
  }

  assert.equal(await attestor.verify(baseline, { ...signed, keyId: "unknown-key" }), false);
  assert.equal(await attestor.verify(baseline, { ...signed, tag: "0".repeat(64) }), false);
  assert.equal(await attestor.verify(baseline, { ...signed, materialDigest: "0".repeat(64) }), false);
  assert.equal(await attestor.verify(baseline, { ...signed, extra: true }), false);
  assert.equal(await attestor.verify(baseline, null), false);
});

test("material admission is exact, bounded, dense, ordered, unique, and one-to-one", async () => {
  const key = await hmacKey("shape fixture", ["sign", "verify"]);
  const attestor = attestation.bindContactSettlementAttestor({
    active: { keyId: "contact-attestor-shape", key },
    verificationOnly: [],
  });
  assert.ok(attestor);
  let getterCalls = 0;
  const accessor = material();
  Object.defineProperty(accessor, "workspaceId", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "workspace-contact";
    },
  });
  const sparseIds = material();
  sparseIds.observationIds = Array(2);
  sparseIds.observationIds[1] = "observation-b";
  const cases = [
    ["extra root field", { ...material(), extra: true }],
    ["root accessor", accessor],
    ["root proxy", new Proxy(material(), {})],
    ["unsorted observations", { ...material(), observationIds: ["observation-b", "observation-a"] }],
    ["duplicate observations", { ...material(), observationIds: ["observation-a", "observation-a"] }],
    ["sparse observations", sparseIds],
    ["misaligned receipt digests", {
      ...material(),
      receiptDigests: [DIGESTS.receiptB, DIGESTS.receiptA],
    }],
    ["reordered receipts", {
      ...material(),
      receipts: [...material().receipts].reverse(),
    }],
    ["duplicate receipt observation", replaceReceipt(material(), 1, { observationId: "observation-a" })],
    ["extra receipt field", replaceReceipt(material(), 0, { extra: true })],
    ["oversized id", { ...material(), workspaceId: "w".repeat(161) }],
    ["noncanonical text", { ...material(), workspaceId: " workspace-contact " }],
    ["uppercase digest", { ...material(), settlementDigest: "A".repeat(64) }],
    ["wrong method/class pair", replaceReceipt(material(), 0, { method: "authoritative_source_reconfirmed" })],
    ["released terminal", { ...material(), terminalState: "released", terminalReason: "rejected" }],
  ];
  for (const [name, candidate] of cases) {
    assert.equal(await attestor.sign(candidate), null, name);
  }
  assert.equal(getterCalls, 0, "malformed input getters are never evaluated");
});

test("binding rejects extractable, wrong-algorithm, wrong-usage, duplicate, and oversized key descriptors", async () => {
  const extractable = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("extractable fixture"),
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const verifyOnly = await hmacKey("verify-only active fixture", ["verify"]);
  const signOnly = await hmacKey("sign-only old fixture", ["sign"]);
  const aes = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const good = await hmacKey("good fixture", ["sign", "verify"]);
  const old = await hmacKey("old fixture", ["verify"]);
  const undersized = await crypto.subtle.importKey(
    "raw",
    new Uint8Array([1]),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const oversized = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(65),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  const cases = [
    { active: { keyId: "undersized", key: undersized }, verificationOnly: [] },
    { active: { keyId: "oversized", key: oversized }, verificationOnly: [] },
    { active: { keyId: "extractable", key: extractable }, verificationOnly: [] },
    { active: { keyId: "verify-only", key: verifyOnly }, verificationOnly: [] },
    { active: { keyId: "aes", key: aes }, verificationOnly: [] },
    { active: { keyId: "duplicate", key: good }, verificationOnly: [{ keyId: "duplicate", key: old }] },
    { active: { keyId: "good", key: good }, verificationOnly: [{ keyId: "sign-only", key: signOnly }] },
    { active: { keyId: "k".repeat(129), key: good }, verificationOnly: [] },
    {
      active: { keyId: "good", key: good },
      verificationOnly: Array.from({ length: 9 }, (_, index) => ({ keyId: `old-${index}`, key: old })),
    },
  ];
  for (const candidate of cases) {
    assert.equal(attestation.bindContactSettlementAttestor(candidate), null);
  }
});

async function hmacKey(secret, usages) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret.padEnd(32, ".")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

function material() {
  const receipts = [
    receipt({
      observationId: "observation-a",
      receiptDigest: DIGESTS.receiptA,
      observationDigest: DIGESTS.observationA,
      requestDigest: DIGESTS.requestA,
      verdictDigest: DIGESTS.verdictA,
      contactId: "contact-a",
      kind: "email",
      verificationClass: "mailbox_verified",
      method: "mailbox_verification",
    }),
    receipt({
      observationId: "observation-b",
      receiptDigest: DIGESTS.receiptB,
      observationDigest: DIGESTS.observationB,
      requestDigest: DIGESTS.requestB,
      verdictDigest: DIGESTS.verdictB,
      contactId: "contact-b",
      kind: "phone",
      verificationClass: "source_verified",
      method: "authoritative_source_reconfirmed",
    }),
  ];
  return {
    schema: "contact-verification-settlement-attestation/v1",
    workspaceId: "workspace-contact",
    reservationId: "reservation-contact",
    grantId: "grant-contact",
    durableRevision: 3,
    terminalState: "settled",
    terminalReason: "completed",
    settlementDigest: DIGESTS.settlement,
    acknowledgementDigest: DIGESTS.acknowledgement,
    documentedUnits: 2,
    documentedCostMinor: 20,
    observationIds: ["observation-a", "observation-b"],
    receiptDigests: [DIGESTS.receiptA, DIGESTS.receiptB],
    receipts,
  };
}

function receipt(patch) {
  return {
    assignmentId: `assignment-${patch.observationId}`,
    prospectId: `prospect-${patch.observationId}`,
    contactId: patch.contactId,
    role: "champion",
    configurationId: "configuration-contact",
    configurationDigest: DIGESTS.configuration,
    providerId: "synthetic-provider",
    providerVersion: "v1",
    catalogRef: "catalog-contact",
    quoteRevision: 2,
    verifierId: "synthetic-verifier",
    verifierVersion: "v1",
    requestDigest: patch.requestDigest,
    verdictReference: `verdict:${patch.observationId}`,
    verdictDigest: patch.verdictDigest,
    observationId: patch.observationId,
    observationDigest: patch.observationDigest,
    receiptDigest: patch.receiptDigest,
    kind: patch.kind,
    verificationClass: patch.verificationClass,
    method: patch.method,
  };
}

function replaceReceipt(value, index, patch) {
  const receipts = value.receipts.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item);
  return { ...value, receipts };
}

function replaceReceiptAndDigest(value, index, digest) {
  const receiptDigests = [...value.receiptDigests];
  receiptDigests[index] = digest;
  return {
    ...replaceReceipt(value, index, { receiptDigest: digest }),
    receiptDigests,
  };
}
