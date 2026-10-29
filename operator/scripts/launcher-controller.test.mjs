import { test } from "node:test";
import assert from "node:assert/strict";
import { controller } from "../launcher/control.mjs";

function fixture(options = {}) {
  const state = {
    pid: 0,
    listener: 0,
    ready: true,
    locked: false,
    built: true,
    installed: true,
    ...options,
  };
  const calls = [];
  const control = controller(
    { uid: 501, label: "test", root: "/app", data: "/data", url: "http://127.0.0.1:8080" },
    {
      run: async (file, args) => {
        calls.push([file, ...args]);
        if (file.endsWith("lsof"))
          return {
            code: state.listener ? 0 : 1,
            stdout: state.listener ? `${state.listener}\n` : "",
          };
        if (file.endsWith("ps")) return { code: 0, stdout: args.at(-1) === "101" ? "100" : "1" };
        if (args[0] === "print")
          return {
            code: state.installed ? 0 : 1,
            stdout: state.pid ? `\tpid = ${state.pid}\n` : "",
          };
        if (args[0] === "kickstart") {
          if (!state.failStart) {
            state.pid = 100;
            state.listener = 101;
          }
          return { code: 0, stdout: "" };
        }
        if (args[0] === "kill") {
          if (state.failStop) return { code: 1, stdout: "" };
          if (!state.stuck) {
            state.pid = 0;
            if (state.listener === 101) state.listener = 0;
          }
          return { code: 0, stdout: "" };
        }
        throw new Error(`Unexpected command ${file} ${args}`);
      },
      exists: async () => state.built,
      isLocked: async () => state.locked,
      ready: async () => state.ready,
      wait: async () => {},
    },
  );
  return { control, state, calls };
}
test("start is ready only after the managed child responds; repeated start does not duplicate it", async () => {
  const f = fixture();
  assert.equal((await f.control.start()).state, "running");
  assert.equal((await f.control.start()).state, "running");
  assert.equal(f.calls.filter((c) => c[1] === "kickstart").length, 1);
});
test("foreign listener blocks start and is never killed by stop or restart", async () => {
  const f = fixture({ listener: 999 });
  await assert.rejects(f.control.start(), /Port 8080/);
  assert.equal((await f.control.stop()).state, "blocked");
  await assert.rejects(f.control.restart(), /Port 8080/);
  assert.equal(f.calls.filter((c) => ["kill", "kickstart"].includes(c[1])).length, 0);
});
test("restart waits for graceful shutdown before starting again", async () => {
  const f = fixture({ pid: 100, listener: 101 });
  assert.equal((await f.control.restart()).state, "running");
  assert.deepEqual(
    f.calls.filter((c) => ["kill", "kickstart"].includes(c[1])).map((c) => c.slice(1)),
    [
      ["kill", "SIGTERM", "gui/501/test"],
      ["kickstart", "gui/501/test"],
    ],
  );
});
test("missing build cannot start a job", async () => {
  const f = fixture({ built: false });
  await assert.rejects(f.control.start(), /npm run build/);
  assert.equal(
    f.calls.some((c) => c[1] === "kickstart"),
    false,
  );
});
test("an active data lock prevents restart; it is never deleted", async () => {
  const f = fixture({ pid: 100, listener: 101, locked: true });
  await assert.rejects(f.control.restart(), /data is still locked/);
  assert.equal(
    f.calls.some((c) => c[1] === "kickstart"),
    false,
  );
});
test("a failed startup gives a recoverable error", async () => {
  const f = fixture({ failStart: true });
  await assert.rejects(f.control.start(), /stopped while starting/);
  f.state.failStart = false;
  assert.equal((await f.control.start()).state, "running");
});
test("a managed process without HTTP readiness is not reported running", async () => {
  const f = fixture({ pid: 100, listener: 101, ready: false });
  assert.equal((await f.control.status()).state, "starting");
  await assert.rejects(f.control.start(), /longer to start/);
});
test("stop timeout never forces shutdown or restarts over an active process", async () => {
  const f = fixture({ pid: 100, listener: 101, stuck: true });
  await assert.rejects(f.control.restart(), /not been force-quit/);
  assert.equal(
    f.calls.some((c) => c[1] === "kickstart"),
    false,
  );
  assert.equal(f.calls.filter((c) => c[1] === "kill").length, 1);
});
test("missing launchd registration and stop failures are actionable", async () => {
  await assert.rejects(fixture({ installed: false }).control.start(), /installer again/);
  await assert.rejects(
    fixture({ pid: 100, listener: 101, failStop: true }).control.stop(),
    /Could not stop/,
  );
});
