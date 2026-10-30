// Test-process only: no socket, including loopback, is needed by this handler lane.
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import { syncBuiltinESMExports } from "node:module";
export const attempts = [];
function deny(kind) {
  return function () {
    attempts.push(kind);
    throw new Error(`Acceptance socket fence: ${kind}`);
  };
}
net.Socket.prototype.connect = deny("net.connect");
tls.connect = deny("tls.connect");
dgram.Socket.prototype.send = deny("dgram.send");
dgram.Socket.prototype.connect = deny("dgram.connect");
syncBuiltinESMExports();
