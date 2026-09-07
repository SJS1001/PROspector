import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";
import { browserAcceptanceCloudflareOptions } from "./scripts/browser-acceptance-boundary.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const localStatePath = process.env.PROSPECTOR_LOCAL_STATE_PATH ?? ".local/miniflare-state";
const browserAcceptanceMarker = process.env.PROSPECTOR_BROWSER_ACCEPTANCE;
const browserAcceptance = browserAcceptanceMarker === "1";
const browserRuntimeRoot = process.env.PROSPECTOR_BROWSER_RUNTIME_ROOT;

if (!browserAcceptance && !/^\.local(?:\/[A-Za-z0-9._-]+)+$/.test(localStatePath)) {
  throw new Error("PROSPECTOR_LOCAL_STATE_PATH must stay under .local/");
}

if (browserAcceptanceMarker !== undefined && !browserAcceptance) {
  throw new Error("PROSPECTOR_BROWSER_ACCEPTANCE must be exactly 1 when supplied");
}
if (browserAcceptance !== Boolean(browserRuntimeRoot)) {
  throw new Error("browser acceptance requires an explicit isolated runtime root");
}
const browserCloudflareOptions = browserAcceptance
  ? browserAcceptanceCloudflareOptions({
      projectRoot: import.meta.dirname,
      runtimeRoot: browserRuntimeRoot!,
      statePath: localStatePath,
    })
  : undefined;

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          migrations_dir: "drizzle",
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // The acceptance root contains only symlinks to the runtime inputs above.
    // Vite and the Cloudflare plugin therefore discover no project .env,
    // .dev.vars, .npmrc, or account configuration during this lane.
    ...(browserAcceptance
      ? { root: browserRuntimeRoot, envDir: browserRuntimeRoot }
      : {}),
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        ...(browserAcceptance
          ? browserCloudflareOptions
          : { persistState: { path: localStatePath }, config: localBindingConfig }),
      }),
    ],
  };
});
