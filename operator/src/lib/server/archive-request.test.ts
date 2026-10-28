import test from "node:test";
import assert from "node:assert/strict";
import { assertArchiveRequest, parseArchiveInput, MAX_ARCHIVE_BYTES } from "./archive-request.ts";

const request = (
  headers: Record<string, string> = {},
  url = "http://localhost:8080/_serverFn/restore",
  method = "POST",
) =>
  new Request(url, {
    method,
    headers: { origin: "http://localhost:8080", "sec-fetch-site": "same-origin", ...headers },
  });

test("archive boundary accepts authenticated current owner on exact local origin", () => {
  assert.doesNotThrow(() => assertArchiveRequest(request(), "fictional-owner"));
});
test("archive boundary rejects absent identity and shared development fallback", () => {
  for (const owner of [undefined, null, "", "dev-user", 123]) {
    assert.throws(() => assertArchiveRequest(request(), owner), /Sign in/);
  }
});
test("archive boundary rejects absent request, cross origin and misleading fetch metadata", () => {
  assert.throws(() => assertArchiveRequest(undefined, "fictional-owner"));
  for (const origin of ["https://attacker.invalid", "null", "http://localhost:8081", ""]) {
    assert.throws(() => assertArchiveRequest(request({ origin }), "fictional-owner"));
  }
  for (const site of ["cross-site", "same-site", "none"]) {
    assert.throws(() =>
      assertArchiveRequest(request({ "sec-fetch-site": site }), "fictional-owner"),
    );
  }
  assert.throws(() =>
    assertArchiveRequest(
      new Request("http://localhost:8080", { method: "POST" }),
      "fictional-owner",
    ),
  );
});
test("archive boundary rejects GET and nonlocal host including suffix lookalikes", () => {
  assert.throws(() => assertArchiveRequest(request({}, undefined, "GET"), "fictional-owner"));
  for (const host of [
    "example.invalid",
    "localhost.attacker.invalid",
    "127.0.0.1.attacker.invalid",
  ]) {
    assert.throws(() =>
      assertArchiveRequest(
        request({ origin: `http://${host}` }, `http://${host}`),
        "fictional-owner",
      ),
    );
  }
});
test("archive input rejects malformed, oversized and caller-supplied owner fields", () => {
  for (const input of [
    null,
    [],
    {},
    { json: 2 },
    { json: "{}", userId: "other-owner" },
    { json: "{" },
  ]) {
    assert.throws(() => parseArchiveInput(input));
  }
  assert.throws(() => parseArchiveInput({ json: " ".repeat(MAX_ARCHIVE_BYTES + 1) }), /20 MiB/);
  assert.throws(() => parseArchiveInput({ json: "é".repeat(MAX_ARCHIVE_BYTES / 2 + 1) }), /20 MiB/);
  assert.deepEqual(parseArchiveInput({ json: "{}" }), {});
});
