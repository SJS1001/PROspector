// Test-only preload: listening/accepted sockets work; every outbound TCP/TLS socket fails.
import net from "node:net";
import { appendFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
net.Socket.prototype.connect = function () {
  if (process.env.AUTH_RUNTIME_ATTEMPTS)
    appendFileSync(process.env.AUTH_RUNTIME_ATTEMPTS, "denied\n", { mode: 0o600 });
  throw new Error("AUTH_RUNTIME_OUTBOUND_DENIED");
};
syncBuiltinESMExports();
