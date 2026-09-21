import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicHttps } from "./retrieve.ts";

test("rejects non-https and private hosts", () => {
  assert.throws(() => assertPublicHttps("http://example.com"), /HTTPS/);
  assert.throws(() => assertPublicHttps("https://localhost/secret"), /Private/);
  assert.throws(() => assertPublicHttps("https://127.0.0.1/"), /Private/);
  assert.throws(() => assertPublicHttps("https://192.168.1.9/"), /Private/);
  assert.throws(() => assertPublicHttps("https://user:pass@example.com/"), /credentials/);
});

test("accepts public https", () => {
  const url = assertPublicHttps("https://www.nordicmining.com/operations/engebo/");
  assert.equal(url.hostname, "www.nordicmining.com");
});
