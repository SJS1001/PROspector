import assert from "node:assert/strict";
import { test } from "node:test";
import { wrapperExitStatus } from "./local-start.mjs";

test("a forwarded shutdown signal that ends the child exits 0", () => {
  assert.equal(wrapperExitStatus(null, "SIGTERM", "SIGTERM"), 0);
  assert.equal(wrapperExitStatus(null, "SIGINT", "SIGINT"), 0);
});

test("a child crash signal that was not forwarded is reported as 128 + signo", () => {
  assert.equal(wrapperExitStatus(null, "SIGSEGV", null), 139);
  assert.equal(wrapperExitStatus(null, "SIGKILL", null), 137);
  assert.equal(wrapperExitStatus(null, "SIGABRT", null), 134);
});

test("a child signal different from the forwarded one is not treated as clean", () => {
  assert.equal(wrapperExitStatus(null, "SIGKILL", "SIGTERM"), 137);
});

test("a normal child exit code is passed through", () => {
  assert.equal(wrapperExitStatus(3, null, null), 3);
  assert.equal(wrapperExitStatus(0, null, "SIGTERM"), 0);
  assert.equal(wrapperExitStatus(null, null, null), 1);
});
