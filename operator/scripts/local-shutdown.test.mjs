import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalShutdown } from "../server/local-shutdown.mjs";

test("shutdown drains HTTP before closing resources and coalesces signals", async () => {
  const events = [];
  let drained;
  const drain = new Promise((resolve) => (drained = resolve));
  const shutdown = createLocalShutdown(
    {
      close: async () => {
        events.push("drain");
        await drain;
      },
    },
    async () => {
      events.push("resources");
    },
  );
  const first = shutdown();
  assert.equal(shutdown(), first);
  assert.deepEqual(events, ["drain"]);
  drained();
  await first;
  assert.deepEqual(events, ["drain", "resources"]);
});

test("forced connections still await the original drain before resource cleanup", async () => {
  const events = [];
  let drained;
  const drain = new Promise((resolve) => (drained = resolve));
  let forced;
  const force = new Promise((resolve) => (forced = resolve));
  const shutdown = createLocalShutdown(
    {
      close: async (all) => {
        events.push(all ? "force" : "drain");
        if (all) forced();
        else await drain;
      },
    },
    async () => {
      events.push("resources");
    },
    1,
  );
  const done = shutdown();
  await force;
  assert.deepEqual(events, ["drain", "force"]);
  drained();
  await done;
  assert.deepEqual(events, ["drain", "force", "resources"]);
});

test("a failed drain never closes resources underneath active requests", async () => {
  let closed = false;
  const shutdown = createLocalShutdown(
    {
      close: async () => {
        throw new Error("drain failed");
      },
    },
    async () => {
      closed = true;
    },
  );
  await assert.rejects(shutdown(), /drain failed/);
  assert.equal(closed, false);
});
