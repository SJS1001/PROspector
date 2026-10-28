import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// No environment flag or caller attestation admits a process. The wrapper
// installs Seatbelt, and every guarded server independently checks inheritance.
export function requireNativeContainment({ positive = false } = {}) {
  if (process.platform === "darwin") {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL("./native-probe.mjs", import.meta.url)),
        ...(positive ? ["--positive"] : []),
      ],
      { encoding: "utf8", env: { PATH: process.env.PATH }, timeout: 15000 },
    );
    if (result.status === 0 && result.stdout.trim() === "NATIVE_CONTAINMENT_PROBES_PASSED") return;
  }
  const error = new Error(
    "Acceptance blocked: reviewed native process/worker/network containment is unavailable",
  );
  error.code = "ACCEPTANCE_NATIVE_CONTAINMENT_UNAVAILABLE";
  throw error;
}
