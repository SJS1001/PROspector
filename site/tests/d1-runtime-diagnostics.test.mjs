import assert from "node:assert/strict";
import test from "node:test";
import { formatSettledRejections, sanitizeRuntimeError } from "./helpers/d1.mjs";

test("runtime diagnostics report sanitized rejection name, message, and cause without payload values", () => {
  const error = new Error("fetch failed");
  error.cause = new Error("other side closed");
  error.cause.code = "UND_ERR_SOCKET";
  const sanitized = sanitizeRuntimeError(error);
  assert.equal(sanitized.name, "Error");
  assert.equal(sanitized.message, "fetch failed");
  assert.equal(sanitized.causeName, "Error");
  assert.equal(sanitized.causeMessage, "other side closed");
  assert.equal(sanitized.causeCode, "UND_ERR_SOCKET");
  assert.equal(Object.hasOwn(sanitized, "stack"), false);
  const formatted = formatSettledRejections([
    { status: "fulfilled", value: true },
    { status: "rejected", reason: error },
  ]);
  assert.equal(formatted.length, 1);
  assert.match(formatted[0], /Error: fetch failed/);
  assert.match(formatted[0], /other side closed/);
});
