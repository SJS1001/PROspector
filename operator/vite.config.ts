import { readdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { isMigrationFile } from "./scripts/migration-plan.mjs";
import { assertLocalRequest } from "./src/lib/auth/local-request";

/** The files `src/lib/db.ts` globs — same directory, same non-recursive scope. */
function hasGlobbedMigrations(root: string): boolean {
  try {
    return readdirSync(join(root, "migrations")).some(isMigrationFile);
  } catch {
    return false;
  }
}

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 *
 * Vite awaiting the hook puts this on time-to-first-render, so an app with no
 * migrations — no schema to apply — skips it entirely rather than paying for a
 * PGLite instance it never queries.
 */
function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      if (!hasGlobbedMigrations(server.config.root)) return;
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

function localBoundaryPlugin(): Plugin {
  return {
    name: "prospector-local-boundary",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          assertLocalRequest(
            new Request(`http://${req.headers.host}${req.url}`, {
              method: req.method,
              headers: Object.fromEntries(
                Object.entries(req.headers).map(([key, value]) => [
                  key,
                  Array.isArray(value) ? value.join(",") : (value ?? ""),
                ]),
              ),
            }),
          );
          res.setHeader("X-Frame-Options", "DENY");
          res.setHeader("Referrer-Policy", "no-referrer");
          next();
        } catch {
          res.statusCode = 403;
          res.end("Forbidden");
        }
      });
    },
  };
}
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
    strictPort: true,
    cors: false,
    fs: { deny: [".env", ".env.*", "**/.git/**", "**/owner.json", "**/operator.vault"] },
  },
  preview: { host: "127.0.0.1", port: 8080, strictPort: true },
  resolve: { tsconfigPaths: true },
  plugins: [
    localBoundaryPlugin(),
    pgliteBootstrapPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [nitro({ preset: "node-server", serverDir: false })]
      : []),
    viteReact(),
  ],
}));
