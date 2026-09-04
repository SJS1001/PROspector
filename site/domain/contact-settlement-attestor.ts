const MATERIAL_SCHEMA = "contact-verification-settlement-attestation/v1" as const;
const ENVELOPE_SCHEMA = "contact-verification-settlement-attestation-envelope/v1" as const;
const ALGORITHM = "HMAC-SHA-256" as const;
const DIGEST = /^[0-9a-f]{64}$/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const MAX_RECEIPTS = 100;
const MAX_VERIFICATION_KEYS = 8;
const encoder = new TextEncoder();

const boundAttestors = new WeakSet<object>();

export type ContactSettlementReceiptBinding = Readonly<{
  assignmentId: string;
  prospectId: string;
  contactId: string;
  role: "champion" | "economic_buyer" | "general";
  configurationId: string;
  configurationDigest: string;
  providerId: string;
  providerVersion: string;
  catalogRef: string;
  quoteRevision: number;
  verifierId: string;
  verifierVersion: string;
  requestDigest: string;
  verdictReference: string;
  verdictDigest: string;
  observationId: string;
  observationDigest: string;
  receiptDigest: string;
  kind: "email" | "phone";
  verificationClass: "mailbox_verified" | "source_verified";
  method: "mailbox_verification" | "authoritative_source_reconfirmed";
}>;

export type ContactSettlementAttestationMaterial = Readonly<{
  schema: typeof MATERIAL_SCHEMA;
  workspaceId: string;
  reservationId: string;
  grantId: string;
  durableRevision: number;
  terminalState: "settled";
  terminalReason: "completed" | "partial";
  settlementDigest: string;
  acknowledgementDigest: string;
  documentedUnits: number;
  documentedCostMinor: number;
  observationIds: readonly string[];
  receiptDigests: readonly string[];
  receipts: readonly ContactSettlementReceiptBinding[];
}>;

export type ContactSettlementAttestation = Readonly<{
  schema: typeof ENVELOPE_SCHEMA;
  algorithm: typeof ALGORITHM;
  keyId: string;
  materialDigest: string;
  tag: string;
}>;

export type ContactSettlementAttestor = Readonly<{
  kind: "contact_settlement_attestor";
  activeKeyId: string;
  sign(material: unknown): Promise<ContactSettlementAttestation | null>;
  verify(material: unknown, attestation: unknown): Promise<boolean>;
}>;

export type ContactSettlementAttestorKey = Readonly<{
  keyId: string;
  key: CryptoKey;
}>;

export type ContactSettlementAttestorConfiguration = Readonly<{
  active: ContactSettlementAttestorKey;
  verificationOnly: readonly ContactSettlementAttestorKey[];
}>;

/**
 * Creates one server-only settlement-attestation capability. Key material remains
 * inside nonextractable CryptoKeys held by the closure; the returned object exposes
 * only a nonsecret key identifier and sign/verify operations.
 */
export function bindContactSettlementAttestor(
  configurationValue: ContactSettlementAttestorConfiguration | unknown,
): ContactSettlementAttestor | null {
  const configuration = exactDataRecord(configurationValue, ["active", "verificationOnly"]);
  if (!configuration) return null;
  const active = normalizeKeyDescriptor(configuration.active, "active");
  const verificationValues = denseArray(configuration.verificationOnly, MAX_VERIFICATION_KEYS, true);
  if (!active || !verificationValues) return null;

  const verificationOnly: ContactSettlementAttestorKey[] = [];
  for (const value of verificationValues) {
    const descriptor = normalizeKeyDescriptor(value, "verification_only");
    if (!descriptor) return null;
    verificationOnly.push(descriptor);
  }
  const keyIds = [active.keyId, ...verificationOnly.map(({ keyId }) => keyId)];
  if (new Set(keyIds).size !== keyIds.length) return null;
  const verificationKeys = new Map<string, CryptoKey>([
    [active.keyId, active.key],
    ...verificationOnly.map(({ keyId, key }) => [keyId, key] as const),
  ]);

  const attestor: ContactSettlementAttestor = Object.freeze({
    kind: "contact_settlement_attestor" as const,
    activeKeyId: active.keyId,
    async sign(materialValue: unknown): Promise<ContactSettlementAttestation | null> {
      const material = normalizeContactSettlementAttestationMaterial(materialValue);
      if (!material) return null;
      try {
        const canonicalMaterial = canonical(material);
        const materialDigest = await sha256(canonicalMaterial);
        const signature = await crypto.subtle.sign(
          "HMAC",
          active.key,
          signingPayload(canonicalMaterial),
        );
        return Object.freeze({
          schema: ENVELOPE_SCHEMA,
          algorithm: ALGORITHM,
          keyId: active.keyId,
          materialDigest,
          tag: bytesToHex(new Uint8Array(signature)),
        });
      } catch {
        return null;
      }
    },
    async verify(materialValue: unknown, attestationValue: unknown): Promise<boolean> {
      const material = normalizeContactSettlementAttestationMaterial(materialValue);
      const envelope = normalizeAttestation(attestationValue);
      if (!material || !envelope) return false;
      const verificationKey = verificationKeys.get(envelope.keyId);
      if (!verificationKey) return false;
      try {
        const canonicalMaterial = canonical(material);
        if (await sha256(canonicalMaterial) !== envelope.materialDigest) return false;
        return crypto.subtle.verify(
          "HMAC",
          verificationKey,
          hexToBuffer(envelope.tag),
          signingPayload(canonicalMaterial),
        );
      } catch {
        return false;
      }
    },
  });
  boundAttestors.add(attestor);
  return attestor;
}

export function isBoundContactSettlementAttestor(value: unknown): value is ContactSettlementAttestor {
  return !!value
    && typeof value === "object"
    && boundAttestors.has(value)
    && (value as ContactSettlementAttestor).kind === "contact_settlement_attestor"
    && typeof (value as ContactSettlementAttestor).sign === "function"
    && typeof (value as ContactSettlementAttestor).verify === "function";
}

/**
 * Converts an untrusted material candidate into the single canonical settlement
 * shape. The returned snapshot is deeply frozen and safe to persist or attest.
 */
export function normalizeContactSettlementAttestationMaterial(
  value: unknown,
): ContactSettlementAttestationMaterial | null {
  const root = exactDataRecord(value, [
    "schema",
    "workspaceId",
    "reservationId",
    "grantId",
    "durableRevision",
    "terminalState",
    "terminalReason",
    "settlementDigest",
    "acknowledgementDigest",
    "documentedUnits",
    "documentedCostMinor",
    "observationIds",
    "receiptDigests",
    "receipts",
  ]);
  if (
    !root
    || root.schema !== MATERIAL_SCHEMA
    || !boundedText(root.workspaceId, 160)
    || !boundedText(root.reservationId, 160)
    || !boundedText(root.grantId, 160)
    || !positiveInteger(root.durableRevision)
    || root.terminalState !== "settled"
    || (root.terminalReason !== "completed" && root.terminalReason !== "partial")
    || !digest(root.settlementDigest)
    || !digest(root.acknowledgementDigest)
    || !nonNegativeInteger(root.documentedUnits)
    || !nonNegativeInteger(root.documentedCostMinor)
  ) return null;

  const observationValues = denseArray(root.observationIds, MAX_RECEIPTS);
  const receiptDigestValues = denseArray(root.receiptDigests, MAX_RECEIPTS);
  const receiptValues = denseArray(root.receipts, MAX_RECEIPTS);
  if (
    !observationValues
    || !receiptDigestValues
    || !receiptValues
    || observationValues.length === 0
    || observationValues.length !== receiptDigestValues.length
    || observationValues.length !== receiptValues.length
    || (root.documentedUnits as number) < observationValues.length
  ) return null;

  const observationIds = observationValues.map((item) => boundedText(item, 160) ? item : null);
  const receiptDigests = receiptDigestValues.map((item) => digest(item) ? item : null);
  if (
    observationIds.some((item) => item === null)
    || receiptDigests.some((item) => item === null)
    || !strictlyIncreasing(observationIds as string[])
  ) return null;

  const receipts: ContactSettlementReceiptBinding[] = [];
  for (let index = 0; index < receiptValues.length; index += 1) {
    const receipt = normalizeReceiptBinding(receiptValues[index]);
    if (
      !receipt
      || receipt.observationId !== observationIds[index]
      || receipt.receiptDigest !== receiptDigests[index]
    ) return null;
    receipts.push(receipt);
  }

  try {
    // Plain proxies are otherwise indistinguishable from their targets through
    // descriptors. Structured cloning rejects them after accessors and bounds
    // have already been eliminated without evaluating user-defined getters.
    structuredClone(value);
  } catch {
    return null;
  }

  return Object.freeze({
    schema: MATERIAL_SCHEMA,
    workspaceId: root.workspaceId as string,
    reservationId: root.reservationId as string,
    grantId: root.grantId as string,
    durableRevision: root.durableRevision as number,
    terminalState: "settled" as const,
    terminalReason: root.terminalReason as "completed" | "partial",
    settlementDigest: root.settlementDigest as string,
    acknowledgementDigest: root.acknowledgementDigest as string,
    documentedUnits: root.documentedUnits as number,
    documentedCostMinor: root.documentedCostMinor as number,
    observationIds: Object.freeze(observationIds as string[]),
    receiptDigests: Object.freeze(receiptDigests as string[]),
    receipts: Object.freeze(receipts),
  });
}

function normalizeReceiptBinding(value: unknown): ContactSettlementReceiptBinding | null {
  const receipt = exactDataRecord(value, [
    "assignmentId",
    "prospectId",
    "contactId",
    "role",
    "configurationId",
    "configurationDigest",
    "providerId",
    "providerVersion",
    "catalogRef",
    "quoteRevision",
    "verifierId",
    "verifierVersion",
    "requestDigest",
    "verdictReference",
    "verdictDigest",
    "observationId",
    "observationDigest",
    "receiptDigest",
    "kind",
    "verificationClass",
    "method",
  ]);
  if (
    !receipt
    || !boundedText(receipt.assignmentId, 160)
    || !boundedText(receipt.prospectId, 160)
    || !boundedText(receipt.contactId, 160)
    || (receipt.role !== "champion" && receipt.role !== "economic_buyer" && receipt.role !== "general")
    || !boundedText(receipt.configurationId, 160)
    || !digest(receipt.configurationDigest)
    || !boundedText(receipt.providerId, 120)
    || !boundedText(receipt.providerVersion, 120)
    || !boundedText(receipt.catalogRef, 256)
    || !positiveInteger(receipt.quoteRevision)
    || !boundedText(receipt.verifierId, 160)
    || !boundedText(receipt.verifierVersion, 160)
    || !digest(receipt.requestDigest)
    || !boundedText(receipt.verdictReference, 256)
    || !digest(receipt.verdictDigest)
    || !boundedText(receipt.observationId, 160)
    || !digest(receipt.observationDigest)
    || !digest(receipt.receiptDigest)
    || (receipt.kind !== "email" && receipt.kind !== "phone")
    || (receipt.verificationClass !== "mailbox_verified" && receipt.verificationClass !== "source_verified")
    || !methodMatches(
      receipt.kind as "email" | "phone",
      receipt.verificationClass as "mailbox_verified" | "source_verified",
      receipt.method,
    )
  ) return null;
  return Object.freeze({
    assignmentId: receipt.assignmentId as string,
    prospectId: receipt.prospectId as string,
    contactId: receipt.contactId as string,
    role: receipt.role as ContactSettlementReceiptBinding["role"],
    configurationId: receipt.configurationId as string,
    configurationDigest: receipt.configurationDigest as string,
    providerId: receipt.providerId as string,
    providerVersion: receipt.providerVersion as string,
    catalogRef: receipt.catalogRef as string,
    quoteRevision: receipt.quoteRevision as number,
    verifierId: receipt.verifierId as string,
    verifierVersion: receipt.verifierVersion as string,
    requestDigest: receipt.requestDigest as string,
    verdictReference: receipt.verdictReference as string,
    verdictDigest: receipt.verdictDigest as string,
    observationId: receipt.observationId as string,
    observationDigest: receipt.observationDigest as string,
    receiptDigest: receipt.receiptDigest as string,
    kind: receipt.kind as "email" | "phone",
    verificationClass: receipt.verificationClass as "mailbox_verified" | "source_verified",
    method: receipt.method as ContactSettlementReceiptBinding["method"],
  });
}

function normalizeAttestation(value: unknown): ContactSettlementAttestation | null {
  const envelope = exactDataRecord(value, ["schema", "algorithm", "keyId", "materialDigest", "tag"]);
  if (
    !envelope
    || envelope.schema !== ENVELOPE_SCHEMA
    || envelope.algorithm !== ALGORITHM
    || !boundedText(envelope.keyId, 128)
    || !digest(envelope.materialDigest)
    || !digest(envelope.tag)
  ) return null;
  try {
    structuredClone(value);
  } catch {
    return null;
  }
  return Object.freeze({
    schema: ENVELOPE_SCHEMA,
    algorithm: ALGORITHM,
    keyId: envelope.keyId as string,
    materialDigest: envelope.materialDigest as string,
    tag: envelope.tag as string,
  });
}

function normalizeKeyDescriptor(
  value: unknown,
  kind: "active" | "verification_only",
): ContactSettlementAttestorKey | null {
  const descriptor = exactDataRecord(value, ["keyId", "key"]);
  if (!descriptor || !boundedText(descriptor.keyId, 128) || !isHmacKey(descriptor.key, kind)) return null;
  return Object.freeze({ keyId: descriptor.keyId as string, key: descriptor.key as CryptoKey });
}

function isHmacKey(value: unknown, kind: "active" | "verification_only"): value is CryptoKey {
  if (
    typeof CryptoKey === "undefined"
    || !(value instanceof CryptoKey)
    || value.type !== "secret"
    || value.extractable
    || value.algorithm.name !== "HMAC"
  ) return false;
  const algorithm = value.algorithm as KeyAlgorithm & { hash?: KeyAlgorithm; length?: number };
  if (
    algorithm.hash?.name !== "SHA-256"
    || !Number.isInteger(algorithm.length)
    || (algorithm.length as number) < 256
    || (algorithm.length as number) > 512
  ) return false;
  const usages = [...value.usages].sort();
  return kind === "active"
    ? usages.length === 2 && usages[0] === "sign" && usages[1] === "verify"
    : usages.length === 1 && usages[0] === "verify";
}

function exactDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      return null;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.length !== keys.length
      || ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
      || keys.some((key) => !Object.hasOwn(descriptors, key))
    ) return null;
    const snapshot: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function denseArray(value: unknown, maximum: number, allowEmpty = false): readonly unknown[] | null {
  try {
    if (
      !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maximum
      || (!allowEmpty && value.length === 0)
    ) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (
      ownKeys.some((key) => typeof key !== "string")
      || ownKeys.length !== value.length + 1
      || !Object.hasOwn(descriptors, "length")
    ) return null;
    const snapshot: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function methodMatches(
  kind: "email" | "phone",
  verificationClass: "mailbox_verified" | "source_verified",
  method: unknown,
): boolean {
  return verificationClass === "mailbox_verified"
    ? kind === "email" && method === "mailbox_verification"
    : method === "authoritative_source_reconfirmed";
}

function boundedText(value: unknown, maximum: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || CONTROL.test(value)) return false;
  return value === value.normalize("NFC").trim();
}

function digest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function strictlyIncreasing(values: readonly string[]): boolean {
  for (let index = 1; index < values.length; index += 1) {
    if (!(values[index - 1] < values[index])) return false;
  }
  return true;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function signingPayload(canonicalMaterial: string): ArrayBuffer {
  return encode(`PROspector\u0000${MATERIAL_SCHEMA}\u0000${canonicalMaterial}`);
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encode(value));
  return bytesToHex(new Uint8Array(bytes));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBuffer(value: string): ArrayBuffer {
  const buffer = new ArrayBuffer(value.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return buffer;
}

function encode(value: string): ArrayBuffer {
  const encoded = encoder.encode(value);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}
