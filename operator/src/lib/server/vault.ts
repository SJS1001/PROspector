import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import {
  assertOutsideCheckout,
  ensurePrivateDataDir,
  readPrivateFile,
  writePrivateFile,
} from "../../../scripts/local-data.mjs";

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

function loadKey(create: boolean) {
  const override = process.env.OPERATOR_VAULT_PATH;
  if (override && !isAbsolute(override)) throw new Error("OPERATOR_VAULT_PATH must be absolute");
  if (override) {
    assertOutsideCheckout(override);
    assertOutsideCheckout(join(realpathSync(dirname(override)), "operator.vault"));
  }
  const path = override || join(ensurePrivateDataDir(), "operator.vault");
  // An old CWD key is never silently abandoned or replaced.
  if (
    !override &&
    !existsSync(path) &&
    existsSync(join(process.cwd(), ".data", "operator.vault"))
  ) {
    throw new Error(
      "Legacy vault found; configure its absolute OPERATOR_VAULT_PATH before continuing.",
    );
  }
  const read = () => {
    if (!override) return readPrivateFile("operator.vault");
    const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.mode & 0o077)
        throw new Error("Unsafe vault permissions");
      return readFileSync(fd);
    } finally {
      closeSync(fd);
    }
  };
  let raw: Buffer;
  try {
    raw = read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !create) throw error;
    if (existsSync(join(ensurePrivateDataDir(), "database")))
      throw new Error(
        "Missing vault key for existing database; restore the matching private backup.",
      );
    const generated = randomBytes(32).toString("base64");
    try {
      if (!override) writePrivateFile("operator.vault", generated);
      else {
        const fd = openSync(
          path,
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
          0o600,
        );
        try {
          writeFileSync(fd, generated);
        } finally {
          closeSync(fd);
        }
      }
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw writeError;
    }
    raw = read();
  }
  const text = raw.toString("utf8").trim();
  const key = Buffer.from(text, "base64");
  if (key.length !== 32 || key.toString("base64") !== text)
    throw new Error("Invalid vault key; restore the matching private backup.");
  return key;
}

export function sealSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", loadKey(true), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function openSecret(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith(PREFIX)) return trimmed;
  const key = loadKey(false);
  try {
    const buf = Buffer.from(trimmed.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function isSensitiveSecret(name: string) {
  return SENSITIVE_SECRETS.has(name);
}
