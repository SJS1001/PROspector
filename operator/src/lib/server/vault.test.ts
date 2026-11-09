import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Synthetic keys in $TMPDIR scratch directories only; never inspect the owner's vault.
function scratch(prefix: string) {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}
function useFreshVault() {
  const vaultPath = join(scratch("vault-"), "operator.vault");
  process.env.OPERATOR_VAULT_PATH = vaultPath;
  // Key creation checks for an existing database; never inspect the owner's directory.
  process.env.OPERATOR_DATA_DIR = scratch("vault-data-");
  return vaultPath;
}
function flipByte(sealed: string, index: number) {
  const buf = Buffer.from(sealed.slice(3), "base64");
  buf[index] ^= 0x01;
  return "v1:" + buf.toString("base64");
}

const { sealSecret, openSecret } = await import("./vault.ts");

test("secrets round-trip and pass legacy plaintext through", () => {
  useFreshVault();
  const sealed = sealSecret("xai-secret");
  assert.match(sealed, /^v1:/);
  assert.equal(openSecret(sealed), "xai-secret");
  assert.equal(openSecret("plaintext-legacy"), "plaintext-legacy");
  assert.equal(openSecret("v1:not-valid"), "");
});

test("a real sealed secret with a flipped ciphertext byte is refused", () => {
  useFreshVault();
  const sealed = sealSecret("xai-secret");
  // Layout: 12-byte IV, 16-byte auth tag, then ciphertext.
  assert.equal(openSecret(flipByte(sealed, 28)), "");
  assert.equal(openSecret(flipByte(sealed, 28 + 9)), "");
  assert.equal(openSecret(sealed), "xai-secret");
});

test("a real sealed secret with a flipped auth-tag byte is refused", () => {
  useFreshVault();
  const sealed = sealSecret("xai-secret");
  assert.equal(openSecret(flipByte(sealed, 12)), "");
  assert.equal(openSecret(flipByte(sealed, 27)), "");
  assert.equal(openSecret(flipByte(sealed, 0)), "");
});

test("a sealed secret does not open under a different vault key", () => {
  useFreshVault();
  const sealed = sealSecret("xai-secret");
  const otherPath = join(scratch("vault-other-"), "operator.vault");
  writeFileSync(otherPath, randomBytes(32).toString("base64"), { mode: 0o600 });
  process.env.OPERATOR_VAULT_PATH = otherPath;
  assert.equal(openSecret(sealed), "");
});

test("a group- or world-readable vault key file is refused", () => {
  const vaultPath = useFreshVault();
  writeFileSync(vaultPath, randomBytes(32).toString("base64"), { mode: 0o600 });
  chmodSync(vaultPath, 0o644);
  assert.throws(() => sealSecret("xai-secret"), /Unsafe vault permissions/);
  assert.throws(() => openSecret("v1:AAAA"), /Unsafe vault permissions/);
});

test("a missing vault key for an existing database is refused, not regenerated", () => {
  useFreshVault();
  mkdirSync(join(process.env.OPERATOR_DATA_DIR!, "database"));
  assert.throws(() => sealSecret("xai-secret"), /Missing vault key for existing database/);
});
