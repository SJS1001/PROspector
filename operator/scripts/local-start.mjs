import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalOwner, ensureLocalOwner } from "./local-owner.mjs";
import { exitStatusFromChild, isMainModule } from "./with-app-env.mjs";
const root = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The wrapper's exit status once the server child has exited. Only the
 * shutdown signal this wrapper forwarded counts as a clean stop; any other
 * signal (SIGSEGV, SIGABRT, an OOM SIGKILL) is reported as 128 + signo.
 */
export function wrapperExitStatus(code, signal, forwardedSignal) {
  if (signal && signal === forwardedSignal) return 0;
  return exitStatusFromChild(code, signal);
}

async function main() {
  try {
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major < 22 || (major === 22 && minor < 13)) throw new Error("Node >=22.13 is required.");
    if (process.env.DATABASE_URL?.trim())
      throw new Error("Unset DATABASE_URL for the local operator; no remote database is opened.");
    if (process.argv.slice(2).some((arg) => arg !== "dev"))
      throw new Error(
        "Only the optional dev argument is supported; host/port overrides are refused.",
      );
    const accessMode = process.env.OPERATOR_ACCESS_MODE ?? "local";
    if (!["local", "password"].includes(accessMode))
      throw new Error("OPERATOR_ACCESS_MODE must be local or password.");
    if (accessMode === "local") await ensureLocalOwner();
    else readLocalOwner();
    const dev = process.argv[2] === "dev";
    if (!dev && !existsSync(join(root, ".output/server/index.mjs")))
      throw new Error("Run npm run build before npm start.");
    const child = spawn(
      process.execPath,
      dev
        ? [
            join(root, "node_modules/vite/bin/vite.js"),
            "--host",
            "127.0.0.1",
            "--port",
            "8080",
            "--strictPort",
          ]
        : [join(root, ".output/server/index.mjs")],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          OPERATOR_ACCESS_MODE: accessMode,
          HOST: "127.0.0.1",
          PORT: "8080",
          NITRO_HOST: "127.0.0.1",
          NITRO_PORT: "8080",
          VITE_AUTH_ENABLED: "true",
        },
      },
    );
    let forwardedSignal = null;
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
      process.on(signal, () => {
        forwardedSignal = signal;
        child.kill(signal);
      });
    child.once("error", () => {
      console.error("Unable to launch local operator.");
      process.exitCode = 1;
    });
    child.once("exit", (code, signal) => {
      if (signal && signal !== forwardedSignal)
        console.error(`Local operator stopped unexpectedly (${signal}).`);
      process.exitCode = wrapperExitStatus(code, signal, forwardedSignal);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (isMainModule(import.meta.url)) await main();
