import { writeFileSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Clear prior evidence before launching anything. Contained failures keep their
// own diagnostics; a stale PASS can never survive a failed launcher/preflight.
writeFileSync(
  new URL("./last-run.json", import.meta.url),
  JSON.stringify(
    {
      status: "BLOCKED_NATIVE_CONTAINMENT",
      node: process.version,
      platform: process.platform,
      cases: [],
      snapshots: [],
      workflowExecuted: false,
      nativeContainment: "unavailable",
      error: {
        stage: "native-containment-preflight",
        code: "ACCEPTANCE_NATIVE_CONTAINMENT_UNAVAILABLE",
      },
    },
    null,
    2,
  ) + "\n",
);
try {
  if (process.platform !== "darwin") {
    const { requireNativeContainment } = await import("./native-boundary.mjs");
    requireNativeContainment();
  }
  // Fixed executable/profile/entrypoint; no inherited NODE_OPTIONS or CLI flags.
  const child = spawn(
    "/usr/bin/sandbox-exec",
    [
      "-f",
      fileURLToPath(new URL("./macos-network.sb", import.meta.url)),
      process.execPath,
      fileURLToPath(new URL("./contained-run.mjs", import.meta.url)),
    ],
    {
      stdio: "inherit",
      env: Object.fromEntries(
        ["PATH", "HOME", "LANG", "TMPDIR", "PLAYWRIGHT_BROWSERS_PATH"]
          .filter((key) => process.env[key] !== undefined)
          .map((key) => [key, process.env[key]]),
      ),
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  const evidence = JSON.parse(readFileSync(new URL("./last-run.json", import.meta.url), "utf8"));
  process.exitCode = status === 0 && evidence.status === "PASS" ? 0 : 1;
} catch (error) {
  // Only fixed diagnostics: child/OS error messages may contain local paths.
  console.error(
    "Acceptance launcher blocked: " +
      (error.code === "ACCEPTANCE_NATIVE_CONTAINMENT_UNAVAILABLE"
        ? "reviewed native process/worker/network containment is unavailable"
        : "macOS containment launch failed"),
  );
  process.exitCode = 1;
}
