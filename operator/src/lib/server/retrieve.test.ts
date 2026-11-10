import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicHttps, resolvePublic, retrieveHttps } from "./retrieve.ts";

test("rejects non-https and private hosts", () => {
  assert.throws(() => assertPublicHttps("http://example.com"), /HTTPS/);
  assert.throws(() => assertPublicHttps("https://localhost/secret"), /Private/);
  assert.throws(() => assertPublicHttps("https://127.0.0.1/"), /Private/);
  assert.throws(() => assertPublicHttps("https://192.168.1.9/"), /Private/);
  assert.throws(() => assertPublicHttps("https://user:pass@example.com/"), /credentials/);
});

test("rejects bracketed IPv6, mapped, unique-local and trailing-dot private hosts", () => {
  for (const url of [
    "https://[::1]/v1",
    "https://[::ffff:127.0.0.1]/v1",
    "https://[::ffff:10.0.0.5]/v1",
    "https://[fd00::1]/v1",
    "https://[fe80::1]/v1",
    "https://[::]/v1",
    "https://localhost./v1",
    "https://LOCALHOST../v1",
    "https://api.localhost/v1",
    "https://printer.local./v1",
    "https://127.0.0.1./v1",
  ]) {
    assert.throws(() => assertPublicHttps(url), /Private/, url);
  }
  assert.equal(assertPublicHttps("https://[2606:4700::1111]/v1").hostname, "[2606:4700::1111]");
});

test("a host that resolves to a private address is rejected before any request", async () => {
  const privateLookup = async () => [{ address: "10.0.0.5", family: 4 }];
  await assert.rejects(resolvePublic("127.0.0.1.nip.io", privateLookup), /Private/);
  await assert.rejects(resolvePublic("mixed.example", async () => [{ address: "8.8.8.8", family: 4 }, { address: "fd00::1", family: 6 }]), /Private/);
  await assert.rejects(resolvePublic("[::1]", privateLookup), /Private/);
  await assert.rejects(resolvePublic("empty.example", async () => []), /resolved/);
  await resolvePublic("public.example", async () => [{ address: "8.8.8.8", family: 4 }]);
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

test("large style blocks before the body cannot swallow article evidence", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(
    `<html><head><title>Plant report</title><style>${".x{color:red}".repeat(2000)}</style></head><body><nav>Subscribe</nav><article><p>The operating copper plant uses analytics to improve recovery.</p></article></body></html>`,
    { headers: { "content-type": "text/html" } },
  ));
  const page = await retrieveHttps("https://8.8.8.8/source");
  assert.equal(page.title, "Plant report");
  assert.equal(page.text, "The operating copper plant uses analytics to improve recovery.");
});
