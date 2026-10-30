import { useNitroApp as getNitroApp, useNitroHooks as getNitroHooks } from "nitro/app";
import { serve } from "srvx/node";
import { closeDatabase } from "../src/lib/db";
import { createLocalShutdown } from "./local-shutdown.mjs";

// Nitro's installed node-server preset drains HTTP but does not call its close
// hook. PGlite must finish and release its lock before the process can exit.
const nitroApp = getNitroApp();
const hooks = getNitroHooks();
hooks.hook("close", closeDatabase);
const parsedPort = Number.parseInt(process.env.NITRO_PORT ?? process.env.PORT ?? "");
const cert = process.env.NITRO_SSL_CERT;
const key = process.env.NITRO_SSL_KEY;
let stopping = false;
const inFlight = new Set<Promise<Response>>();
const server = serve({
  port: Number.isNaN(parsedPort) ? 3000 : parsedPort,
  hostname: process.env.NITRO_HOST || process.env.HOST,
  tls: cert && key ? { cert, key } : undefined,
  gracefulShutdown: false,
  async fetch(request) {
    if (stopping) return new Response("Server stopping", { status: 503 });
    const pending = Promise.resolve().then(() => nitroApp.fetch(request));
    inFlight.add(pending);
    try {
      return await pending;
    } finally {
      inFlight.delete(pending);
    }
  },
});
const shutdown = createLocalShutdown(server, async () => {
  // Forced socket closure does not cancel an executing request handler.
  await Promise.allSettled(inFlight);
  await hooks.callHook("close");
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    stopping = true;
    void shutdown().catch(() => {
      console.error("Local server shutdown failed.");
      process.exitCode = 1;
    });
  });
}
