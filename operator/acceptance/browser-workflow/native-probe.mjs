// No JS network guard is installed here. This executes in a fresh native child.
import net from "node:net";
import dgram from "node:dgram";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

async function deniedConnect(host, port) {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1500, () => {
      socket.destroy();
      reject(new Error("probe timeout"));
    });
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error("probe allowed"));
    });
    socket.once("error", (error) => {
      socket.destroy();
      if (["EPERM", "EACCES"].includes(error.code)) resolve();
      else reject(new Error("probe did not prove OS denial"));
    });
  });
}

// Always first: safe local negative control. Outside containment, refused/
// successful/timed-out connections all FAIL. Do not proceed to external probes.
await deniedConnect("127.0.0.1", 8081);
await deniedConnect("::1", 8081);
// TEST-NET address: only reached after the local OS-denial control succeeds.
await deniedConnect("192.0.2.1", 443);
await deniedConnect("2001:db8::1", 443);
await new Promise((resolve, reject) => {
  const socket = dgram.createSocket("udp4");
  const finish = (error) => {
    try {
      socket.close();
    } catch {
      /* A denied bind leaves no open socket. */
    }
    if (["EPERM", "EACCES"].includes(error?.code)) resolve();
    else reject(new Error("UDP not denied by OS"));
  };
  socket.once("error", finish);
  socket.send(Buffer.from("fictional"), 8080, "127.0.0.1", finish);
});
if (!process.argv.includes("--leaf")) {
  // This is the independently reproduced escape primitive, not child.spawn.
  const result = process.binding("spawn_sync").spawn({
    file: process.execPath,
    args: [process.execPath, fileURLToPath(import.meta.url), "--leaf"],
    envPairs: [],
    stdio: [{ type: "ignore" }, { type: "ignore" }, { type: "ignore" }],
  });
  if (result.status !== 0) throw new Error("native descendant did not retain containment");
  const worker = new Worker(new URL(import.meta.url), { argv: ["--leaf"] });
  await new Promise((resolve, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("worker containment failed")),
    );
  });
}
if (process.argv.includes("--positive")) {
  // Bind our own listeners before proving allowed traffic; never probe another
  // installation. This runs once, before any application/browser launch.
  const servers = [];
  try {
    for (const port of [8080, 8082]) {
      const server = net.createServer((socket) => socket.end());
      servers.push(server);
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen({ host: "127.0.0.1", port }, resolve);
      });
    }
    // Asynchronous child creation lets this process accept its connections.
    const { spawn } = await import("node:child_process");
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import net from "node:net";
      for (const port of [8080,8082]) await new Promise((resolve,reject)=>{
        const s=net.connect({host:"127.0.0.1",port});
        s.once("connect",()=>{s.end();resolve();}); s.once("error",reject);
      });
    `,
      ],
      { env: {}, stdio: "ignore" },
    );
    await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("allowed native loopback failed")),
      );
    });
  } finally {
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  }
}
if (!process.argv.includes("--leaf")) console.log("NATIVE_CONTAINMENT_PROBES_PASSED");
