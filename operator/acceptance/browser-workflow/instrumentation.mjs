// Supplemental JS API instrumentation only; NOT native containment.
// Unit tests may import this directly. Application execution must use guard.mjs.
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import dns from "node:dns";
import dnsPromises from "node:dns/promises";
import http from "node:http";
import http2 from "node:http2";
import workers from "node:worker_threads";
import https from "node:https";
import child from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { appendFileSync } from "node:fs";
export function deny(name) {
  return function () {
    if (process.env.ACCEPTANCE_EVENTS)
      appendFileSync(
        process.env.ACCEPTANCE_EVENTS,
        JSON.stringify({ kind: "denied", name }) + "\n",
      );
    throw new Error(`Acceptance fence denied: ${name}`);
  };
}
net.Socket.prototype.connect = deny("socket.connect");
net.connect = net.createConnection = deny("net.connect");
tls.connect = deny("tls.connect");
dgram.createSocket = deny("dgram.createSocket");
dgram.Socket.prototype.send = deny("dgram.send");
dgram.Socket.prototype.connect = deny("dgram.connect");
for (const Resolver of [dns.Resolver, dnsPromises.Resolver])
  for (const name of Object.getOwnPropertyNames(Resolver.prototype)) {
    if (/^(lookup|resolve|reverse)/.test(name)) Resolver.prototype[name] = deny(`resolver.${name}`);
  }
child.ChildProcess.prototype.spawn = deny("ChildProcess.spawn");
for (const target of [dns, dnsPromises])
  for (const name of Object.keys(target)) {
    if (/^(lookup|resolve|reverse)/.test(name)) target[name] = deny(`dns.${name}`);
  }
// Node's inbound listen calls dns.lookup even for a literal IPv4 address.
// Resolve that literal in memory only; no OS resolver is invoked.
dns.lookup = (host, options, callback) => {
  if (host !== "127.0.0.1") return deny("dns.lookup")();
  if (typeof options === "function") {
    callback = options;
    options = {};
  }
  queueMicrotask(() =>
    options?.all
      ? callback(null, [{ address: "127.0.0.1", family: 4 }])
      : callback(null, "127.0.0.1", 4),
  );
};
dnsPromises.lookup = async (host, options) => {
  if (host !== "127.0.0.1") return deny("dns.lookup")();
  return options?.all ? [{ address: "127.0.0.1", family: 4 }] : { address: "127.0.0.1", family: 4 };
};
for (const protocol of [http, https]) {
  protocol.request = deny("http.request");
  protocol.get = deny("http.get");
}
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"])
  child[name] = deny(`child.${name}`);
http2.connect = deny("http2.connect");
workers.Worker = deny("Worker");
globalThis.fetch = deny("fetch");
globalThis.WebSocket = deny("WebSocket");
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const options = args[0];
  if (
    !options ||
    typeof options !== "object" ||
    options.host !== "127.0.0.1" ||
    Number(options.port) !== 8080
  ) {
    return deny("server.listen")();
  }
  this.once("listening", () => {
    const address = this.address();
    if (!address || address.address !== "127.0.0.1" || address.port !== 8080)
      return deny("listener.address")();
    appendFileSync(
      process.env.ACCEPTANCE_EVENTS,
      JSON.stringify({
        kind: "listening",
        pid: process.pid,
        host: address.address,
        port: address.port,
      }) + "\n",
    );
  });
  return listen.apply(this, args);
};
syncBuiltinESMExports();
