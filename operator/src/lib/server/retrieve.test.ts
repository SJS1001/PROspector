import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicHttps, retrieveHttps } from "./retrieve.ts";

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

test("retrieval rejects downloads and binary content before saving evidence", async (t) => {
  for (const [body, contentType] of [
    ["%PDF-1.7 binary", "application/pdf"],
    ["%PDF-1.7 disguised", "text/html"],
    ["<body>binary\0data</body>", "text/html"],
    ["<html><body></body></html>", "text/html"],
  ]) {
    t.mock.method(
      globalThis,
      "fetch",
      async () => new Response(body, { headers: { "content-type": contentType } }),
    );
    await assert.rejects(retrieveHttps("https://8.8.8.8/source"), /Source/);
    t.mock.restoreAll();
  }
});

test("retrieval extracts readable HTML evidence", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        "<html><title>Mine operations</title><body><script>secret</script><p>Operating copper mine</p></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8" } },
      ),
  );
  const page = await retrieveHttps("https://8.8.8.8/source");
  assert.equal(page.title, "Mine operations");
  assert.equal(page.text, "Operating copper mine");
  assert.match(page.hash, /^[a-f0-9]{64}$/);
});
