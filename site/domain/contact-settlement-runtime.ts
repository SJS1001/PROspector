import {
  bindContactSettlementAttestor,
  type ContactSettlementAttestor,
  type ContactSettlementAttestorKey,
} from "./contact-settlement-attestor";

type EncodedKey = Readonly<{ keyId: string; keyBase64: string }>;

/**
 * Imports an optional secret runtime key ring into nonextractable WebCrypto
 * keys. An absent or malformed binding keeps the caller reject-only.
 */
export async function bindRuntimeContactSettlementAttestor(
  encodedConfiguration: unknown,
): Promise<ContactSettlementAttestor | null> {
  if (typeof encodedConfiguration !== "string" || encodedConfiguration.length === 0 || encodedConfiguration.length > 16_384) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(encodedConfiguration);
  } catch {
    return null;
  }
  if (!exactRecord(parsed, ["active", "verificationOnly"])) return null;
  const active = encodedKey(parsed.active);
  if (!active || !Array.isArray(parsed.verificationOnly) || parsed.verificationOnly.length > 8) return null;
  const old = parsed.verificationOnly.map(encodedKey);
  if (old.some((key) => key === null)) return null;
  try {
    const activeKey = await importKey(active, ["sign", "verify"]);
    const verificationOnly = await Promise.all(
      (old as EncodedKey[]).map((key) => importKey(key, ["verify"])),
    );
    return bindContactSettlementAttestor({
      active: activeKey,
      verificationOnly,
    });
  } catch {
    return null;
  }
}

async function importKey(
  encoded: EncodedKey,
  usages: KeyUsage[],
): Promise<ContactSettlementAttestorKey> {
  const bytes = decodeBase64(encoded.keyBase64);
  if (!bytes || bytes.byteLength < 32 || bytes.byteLength > 64) throw new Error("invalid_contact_attestation_key");
  const key = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
  return Object.freeze({ keyId: encoded.keyId, key });
}

function encodedKey(value: unknown): EncodedKey | null {
  if (!exactRecord(value, ["keyId", "keyBase64"])) return null;
  if (
    typeof value.keyId !== "string"
    || value.keyId.length === 0
    || value.keyId.length > 128
    || typeof value.keyBase64 !== "string"
    || value.keyBase64.length === 0
    || value.keyBase64.length > 128
  ) return null;
  return Object.freeze({ keyId: value.keyId, keyBase64: value.keyBase64 });
}

function decodeBase64(value: string): ArrayBuffer | null {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(value) || value.length % 4 !== 0) return null;
    const decoded = atob(value);
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    const canonical = btoa(String.fromCharCode(...bytes));
    if (canonical !== value) return null;
    return bytes.buffer;
  } catch {
    return null;
  }
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
