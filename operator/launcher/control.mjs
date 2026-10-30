import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
export async function run(file, args) {
  try {
    const { stdout } = await execute(file, args, { timeout: 8000, maxBuffer: 1024 * 1024 });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.code || 1, stdout: error.stdout || "" };
  }
}

// Only the launchd job installed for this app can be stopped. A listener on the
// same port is never sufficient evidence of ownership.
export function controller(config, deps = {}) {
  const command = deps.run || run;
  const wait = deps.wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const exists =
    deps.exists ||
    ((path) =>
      access(path).then(
        () => true,
        () => false,
      ));
  const ready =
    deps.ready ||
    (async () => {
      try {
        const response = await fetch(`${config.url}/api/auth/get-session`, {
          signal: AbortSignal.timeout(2000),
          redirect: "error",
        });
        // This read-only endpoint works in both supported access modes.
        return (
          response.ok && (response.headers.get("content-type") || "").includes("application/json")
        );
      } catch {
        return false;
      }
    });
  const target = `gui/${config.uid}/${config.label}`;
  async function belongsTo(pid, parent) {
    const seen = new Set();
    while (pid > 1 && !seen.has(pid)) {
      if (pid === parent) return true;
      seen.add(pid);
      const result = await command("/bin/ps", ["-o", "ppid=", "-p", String(pid)]);
      if (result.code) return false;
      pid = Number(result.stdout.trim());
    }
    return false;
  }
  async function status() {
    const job = await command("/bin/launchctl", ["print", target]);
    const pid = Number(job.stdout.match(/^\s*pid = (\d+)$/m)?.[1] || 0);
    const listener = await command("/usr/sbin/lsof", ["-nP", "-t", "-iTCP:8080", "-sTCP:LISTEN"]);
    // lsof returns 1 for no matches. Fail closed on unexpected inspection errors.
    if (listener.code !== 0 && listener.code !== 1)
      throw new Error("Could not check the app's port. Try again.");
    const pids = [...new Set(listener.stdout.trim().split(/\s+/).filter(Boolean).map(Number))];
    const owned =
      pids.length > 0 && (await Promise.all(pids.map((p) => belongsTo(p, pid)))).every(Boolean);
    if (pids.length && !owned)
      return {
        state: "blocked",
        managed: pid > 0,
        message: "Port 8080 is in use. Stop the other app, then try again.",
      };
    if (job.code)
      return {
        state: "unavailable",
        managed: false,
        message: "Setup is missing. Run the launcher installer again.",
      };
    if (pid && owned && (await ready()))
      return { state: "running", managed: true, message: "Running on this Mac" };
    if (pid) return { state: "starting", managed: true, message: "Starting…" };
    return { state: "stopped", managed: false, message: "Ready to start" };
  }
  async function start() {
    let state = await status();
    if (state.state === "running") return state;
    if (["blocked", "unavailable"].includes(state.state)) throw new Error(state.message);
    if (!(await exists(`${config.root}/.output/server/index.mjs`)))
      throw new Error("The app needs to be built. Run npm run build in the operator folder.");
    if (!state.managed) {
      const result = await command("/bin/launchctl", ["kickstart", target]);
      if (result.code) throw new Error("Could not start the app. Open the log for details.");
    }
    for (let attempt = 0; attempt < 40; attempt++) {
      await wait(750);
      state = await status();
      if (state.state === "running") return state;
      if (state.state === "blocked") throw new Error(state.message);
      if (attempt > 2 && !state.managed)
        throw new Error(
          "The app stopped while starting. Open the log, fix the problem, then try again.",
        );
    }
    throw new Error("The app is taking longer to start. Check its status or open the log.");
  }
  async function stop() {
    const before = await status();
    if (!before.managed) return before;
    const result = await command("/bin/launchctl", ["kill", "SIGTERM", target]);
    if (result.code) throw new Error("Could not stop the app. Try again.");
    for (let attempt = 0; attempt < 30; attempt++) {
      await wait(500);
      const state = await status();
      if (!state.managed) {
        // Shutdown must release the database before a subsequent restart.
        if (await exists(`${config.data}/.database.lock`))
          throw new Error(
            "The app stopped but its data is still locked. Check the recovery guide before restarting.",
          );
        return state;
      }
    }
    throw new Error("The app is still closing. Wait, then try again. It has not been force-quit.");
  }
  return {
    status,
    start,
    stop,
    async restart() {
      await stop();
      return start();
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const config = JSON.parse(await readFile(new URL("config.json", import.meta.url), "utf8"));
    const action = process.argv[2];
    if (!["status", "start", "stop", "restart"].includes(action))
      throw new Error("Unknown launcher action.");
    console.log(JSON.stringify(await controller(config)[action]()));
  } catch (error) {
    console.log(JSON.stringify({ state: "error", managed: false, message: error.message }));
    process.exitCode = 1;
  }
}
