import { attempts } from "./socket-fence.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Socket } from "node:net";
import { connect } from "node:tls";
import { createSocket } from "node:dgram";

test("socket fence refuses TCP, TLS and UDP before opening a connection", () => {
  const tcp = new Socket();
  const udp = createSocket("udp4");
  try {
    assert.throws(() => tcp.connect(443, "provider.example"), /Acceptance socket fence/);
    assert.throws(() => connect(443, "provider.example"), /Acceptance socket fence/);
    assert.throws(() => udp.connect(443, "provider.example"), /Acceptance socket fence/);
    assert.throws(() => udp.send("fictional", 443, "provider.example"), /Acceptance socket fence/);
    assert.deepEqual(attempts, ["net.connect", "tls.connect", "dgram.connect", "dgram.send"]);
  } finally {
    tcp.destroy();
    udp.close();
  }
});
