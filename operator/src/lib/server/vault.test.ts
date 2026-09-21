import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("secrets round-trip and refuse tampering", async () => {
  process.env.OPERATOR_VAULT_PATH = join(mkdtempSync(join(tmpdir(), "vault-")), "operator.vault");
  const { sealSecret, openSecret } = await import("./vault.ts");
  const sealed = sealSecret("xai-secret");
  assert.match(sealed, /^v1:/);
  assert.equal(openSecret(sealed), "xai-secret");
  assert.equal(openSecret("plaintext-legacy"), "plaintext-legacy");
  assert.equal(openSecret("v1:not-valid"), "");
});
