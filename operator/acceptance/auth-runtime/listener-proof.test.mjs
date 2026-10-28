import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertLoopbackListener,
  assertLsofListener,
  launcherChildren,
  procListeners,
  procProcess,
} from "./listener-proof.mjs";

const mac = "p402\nf20\ntIPv4\nn127.0.0.1:8080\n";
test("macOS lsof accepts only one exact IPv4 loopback listener owned by the server child", () => {
  assertLsofListener(mac, [402]);
  for (const text of [
    mac.replace("127.0.0.1", "*"),
    mac.replace("IPv4", "IPv6"),
    mac.replace("127.0.0.1", "[::1]"),
    mac.replace("8080", "8081"),
    mac.replace("p402", "p999"),
    mac + mac,
    "p402\nf20\nn127.0.0.1:8080\n",
    "p402\ntIPv4\nn127.0.0.1:8080\n",
    "",
  ])
    assert.throws(() => assertLsofListener(text, [402]));
});
test("process inventory selects exact immediate server children", () => {
  assert.deepEqual(launcherChildren("401 1\n402 401\n403 402\n999 1\n", 401), [402]);
  assert.throws(() => launcherChildren("402 bad", 401));
});
test("Linux proc parser retains listener inode and includes non-loopback/IPv6 for rejection", () => {
  const header = "sl local_address rem_address st tx_queue tr retrnsmt uid timeout inode\n";
  const row =
    "0: 0100007F:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 12345";
  assert.deepEqual(procListeners(header + row), [{ address: "0100007F:1F90", inode: "12345" }]);
  assert.equal(procListeners(header + row.replace("0A", "01")).length, 0);
  assert.equal(procListeners(header + row.replace("1F90", "1F91")).length, 0);
  for (const address of ["00000000:1F90", "00000000000000000000000001000000:1F90"])
    assert.equal(procListeners(header + row.replace("0100007F:1F90", address))[0].address, address);
  assert.throws(() => procListeners(header + "broken"));
});
test("unknown listener-proof platforms fail closed", () => {
  assert.throws(() => assertLoopbackListener(401, "unknown"), /unsupported/);
});
test("Linux PID inventory translates nested namespace PID without losing outer parent ownership", () => {
  assert.deepEqual(procProcess("Pid:\t123\nPPid:\t100\nNSpid:\t123 50 7\n"), {
    pid: 123,
    ppid: 100,
    localPid: 7,
  });
  assert.deepEqual(procProcess("Pid:\t123\nPPid:\t100\nNSpid:\t123\n"), {
    pid: 123,
    ppid: 100,
    localPid: 123,
  });
  assert.throws(() => procProcess("Pid:\t123\nPPid:\t100\n"));
});
