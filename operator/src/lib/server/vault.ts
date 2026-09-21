import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PREFIX = "v1:";

export const SENSITIVE_SECRETS = new Set([
  "xai",
  "apollo",
  "gmail_user",
  "gmail_pass",
  "zoominfo",
  "llm_key",
  "jev",
]);

function vaultPath() {
  return process.env.OPERATOR_VAULT_PATH || join(process.cwd(), ".data", "operator.vault");
}

function loadKey() {
  const path = vaultPath();
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8").trim();
    return Buffer.from(raw, "base64");
  }
  mkdirSync(dirname(path), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(path, key.toString("base64"), { mode: 0o600 });
  return key;
}

export function sealSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function openSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith(PREFIX)) return trimmed;
  try {
    const buf = Buffer.from(trimmed.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", loadKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function isSensitiveSecret(name: string) {
  return SENSITIVE_SECRETS.has(name);
}
