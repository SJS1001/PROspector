import { unstable_getVarsForDev } from "wrangler";
import {
  BROWSER_ACCEPTANCE_CONFIG,
  browserAcceptanceWorkerConfig,
} from "../../scripts/browser-acceptance-boundary.mjs";
import { resolve } from "node:path";

const runtimeRoot = process.argv[2];
if (!runtimeRoot) throw new Error("runtime root required");
const config = browserAcceptanceWorkerConfig({ d1: "DB", r2: "FILES" });
const bindings = unstable_getVarsForDev(
  resolve(runtimeRoot, BROWSER_ACCEPTANCE_CONFIG),
  undefined,
  config.vars,
  undefined,
  true,
  config.secrets,
);
process.stdout.write(JSON.stringify(
  Object.fromEntries(Object.entries(bindings).map(([name, binding]) => [name, binding.value])),
));
