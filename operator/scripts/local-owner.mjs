import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { hashPassword } from "better-auth/crypto";
import {
  acquireDatabaseLock,
  ensurePrivateDataDir,
  readPrivateFile,
  writePrivateFile,
} from "./local-data.mjs";

export const LOCAL_ORIGIN = "http://127.0.0.1:8080";
export const OWNER_EMAIL = "owner@localhost.invalid";
const FILE = "owner.json";
export function readLocalOwner() {
  let owner;
  try {
    owner = JSON.parse(readPrivateFile(FILE).toString("utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      throw new Error("Local owner is not enrolled. Run npm run owner:setup first.");
    throw new Error(
      "Cannot read local owner configuration; restore the private data directory backup.",
    );
  }
  if (
    owner.version !== 1 ||
    !/^[a-f0-9-]{36}$/.test(owner.id) ||
    !/^[a-f0-9]{64}$/.test(owner.authSecret) ||
    typeof owner.passwordHash !== "string" ||
    !/^[a-f0-9]+:[a-f0-9]+$/.test(owner.passwordHash)
  ) {
    throw new Error("Invalid local owner configuration; do not reset the database.");
  }
  return owner;
}
/** @param {string} password @param {boolean} reset */
export async function enrollOwner(password, reset = false) {
  if (typeof password !== "string" || password.length < 16 || password.length > 128) {
    throw new Error("Use a password between 16 and 128 characters.");
  }
  const dir = ensurePrivateDataDir();
  const release = acquireDatabaseLock();
  try {
    const prior = reset ? readLocalOwner() : null;
    if (!reset && existsSync(join(dir, "database")))
      throw new Error(
        "Existing database found; restore its matching owner configuration instead of enrolling a new owner.",
      );
    if (!reset && !existsSync(join(dir, "operator.vault")))
      writePrivateFile("operator.vault", randomBytes(32).toString("base64"));
    const owner = {
      version: 1,
      id: prior?.id ?? randomUUID(),
      passwordHash: await hashPassword(password),
      authSecret: randomBytes(32).toString("hex"),
    };
    if (reset) {
      const temporary = `owner-${randomUUID()}.tmp`;
      writePrivateFile(temporary, JSON.stringify(owner));
      renameSync(join(dir, temporary), join(dir, FILE));
    } else {
      writePrivateFile(FILE, JSON.stringify(owner));
    }
    return owner;
  } finally {
    release();
  }
}

/** Local access uses the same durable owner and vault, without a user password. */
export function localAccessEnabled() {
  return process.env.OPERATOR_ACCESS_MODE === "local";
}
export async function ensureLocalOwner() {
  const dir = ensurePrivateDataDir();
  if (existsSync(join(dir, FILE))) return readLocalOwner();
  // An unused random credential preserves the existing on-disk format. No
  // password is displayed, accepted from the browser or required for local use.
  return enrollOwner(randomBytes(48).toString("hex"));
}
