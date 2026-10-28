import assert from "node:assert/strict";
import { readFileSync, readdirSync, readlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function launcherChildren(text, launcherPid) {
  return text
    .trim()
    .split("\n")
    .flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)$/);
      assert.ok(match, "process inventory must contain only PID/PPID pairs");
      return Number(match[2]) === launcherPid ? [Number(match[1])] : [];
    });
}

export function procListeners(text) {
  return text
    .trim()
    .split("\n")
    .slice(1)
    .flatMap((line) => {
      const fields = line.trim().split(/\s+/);
      assert.ok(fields.length >= 10, "complete proc socket record");
      return fields[1].endsWith(":1F90") && fields[3] === "0A"
        ? [{ address: fields[1], inode: fields[9] }]
        : [];
    });
}

export function lsofListeners(text) {
  let pid, socket;
  const listeners = [];
  for (const line of text.trim().split("\n")) {
    const field = line[0],
      value = line.slice(1);
    if (field === "p") {
      assert.match(value, /^\d+$/);
      pid = Number(value);
      socket = undefined;
    } else if (field === "f") {
      assert.ok(pid, "lsof descriptor has an owning PID");
      socket = { pid };
      listeners.push(socket);
    } else if (field === "t" || field === "n") {
      assert.ok(socket, "lsof socket has a descriptor");
      socket[field === "t" ? "type" : "address"] = value;
    } else assert.fail("unexpected lsof output field");
  }
  return listeners;
}

export function assertLsofListener(text, children) {
  const listeners = lsofListeners(text);
  assert.equal(listeners.length, 1, "exactly one port-8080 listener");
  const listener = listeners[0];
  assert.equal(listener.type, "IPv4");
  assert.equal(listener.address, "127.0.0.1:8080");
  assert.ok(children.includes(listener.pid), "listener belongs to the launcher's exact child PID");
}

export function procProcess(text) {
  const field = (name) => {
    const match = text.match(new RegExp(`^${name}:\\s+([0-9\\t ]+)$`, "m"));
    assert.ok(match, "complete proc PID inventory");
    return match[1].trim().split(/\s+/).map(Number);
  };
  return { pid: field("Pid")[0], ppid: field("PPid")[0], localPid: field("NSpid").at(-1) };
}

export function assertLoopbackListener(launcherPid, platform = process.platform) {
  assert.ok(["linux", "darwin"].includes(platform), "unsupported listener-proof platform");
  if (platform === "darwin") {
    const inventory = spawnSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8", timeout: 5000 });
    assert.equal(inventory.status, 0, "process inventory available");
    const children = launcherChildren(inventory.stdout, launcherPid);
    assert.equal(children.length, 1, "launcher owns exactly one server child");
    const result = spawnSync("lsof", ["-nP", "-iTCP:8080", "-sTCP:LISTEN", "-F", "pftn"], {
      encoding: "utf8",
      timeout: 5000,
    });
    assert.equal(result.status, 0, "lsof listener inventory available");
    assertLsofListener(result.stdout, children);
    return;
  }
  // /proc can expose outer PIDs while Node uses nested namespace PIDs. Match
  // the exact PID namespace first, then translate NSpid before checking PPid.
  const namespace = readlinkSync("/proc/self/ns/pid");
  const processes = readdirSync("/proc")
    .filter((name) => /^\d+$/.test(name))
    .flatMap((pid) => {
      try {
        return readlinkSync(`/proc/${pid}/ns/pid`) === namespace
          ? [procProcess(readFileSync(`/proc/${pid}/status`, "utf8"))]
          : [];
      } catch (error) {
        // Unrelated processes can be hidden. The required launcher/child must
        // still be positively identified below; absence never passes ownership.
        if (["ENOENT", "EACCES", "ESRCH"].includes(error.code)) return [];
        throw error;
      }
    });
  const launchers = processes.filter((entry) => entry.localPid === launcherPid);
  assert.equal(launchers.length, 1, "exact launcher PID in current namespace");
  const children = processes.filter((entry) => entry.ppid === launchers[0].pid);
  assert.equal(children.length, 1, "launcher owns exactly one server child");
  const listeners = ["/proc/net/tcp", "/proc/net/tcp6"].flatMap((path) =>
    procListeners(readFileSync(path, "utf8")),
  );
  assert.equal(listeners.length, 1, "exactly one port-8080 listener");
  assert.equal(listeners[0].address, "0100007F:1F90");
  const fdRoot = `/proc/${children[0].pid}/fd`;
  assert.ok(
    readdirSync(fdRoot).some((fd) => {
      try {
        return readlinkSync(`${fdRoot}/${fd}`) === `socket:[${listeners[0].inode}]`;
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    }),
    "listener socket belongs to the launcher's exact child PID",
  );
}
