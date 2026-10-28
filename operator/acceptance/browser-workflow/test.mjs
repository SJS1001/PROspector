import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// The public test entrypoint invalidates old workflow evidence even when the
// unit stage fails before the native-containment launcher can execute.
writeFileSync(
  new URL("./last-run.json", import.meta.url),
  JSON.stringify(
    {
      status: "BLOCKED_UNIT_CHECKS",
      node: process.version,
      platform: process.platform,
      cases: [],
      snapshots: [],
      workflowExecuted: false,
      nativeContainment: "unavailable",
      error: { stage: "unit-checks", code: "ACCEPTANCE_UNIT_CHECKS_INCOMPLETE" },
    },
    null,
    2,
  ) + "\n",
);

const units = spawnSync(process.execPath, ["--run", "test:unit"], {
  cwd: fileURLToPath(new URL(".", import.meta.url)),
  stdio: "inherit",
});
if (units.error || units.signal || units.status !== 0) {
  console.error("Acceptance blocked: unit checks did not pass");
  process.exitCode = 1;
} else {
  await import("./run.mjs");
}
