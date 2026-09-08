import { relative, resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Keeps development-only demo and synthetic-acceptance modules out of the
 * deployed artifact.
 *
 * Every LOCAL_DEMO and C4 seam is already gated on `import.meta.env.DEV`, and
 * those gates fold correctly, but folding is not removal. Two of these modules
 * stay reachable in the production module graph regardless:
 *
 * - `app/local-demo/page.tsx` and `app/api/local-demo/**` are file-system
 *   routes, so nothing keeps them out of the production route table; and
 * - `domain/person-discovery-c4-acceptance.ts` is imported by the *production*
 *   `app/api/contacts/person-discovery` route, whose gated call the bundler
 *   cannot constant-propagate across function boundaries.
 *
 * So their synthetic fixtures, identities, and route bodies are emitted into
 * `dist/` even though no production request can reach them. This plugin
 * replaces those modules with inert stubs during a production build, making the
 * boundary structural rather than a property of dead-code elimination.
 *
 * The stubs keep the same export surface, so a production import that survives
 * still type-checks and still fails closed.
 */
export function excludeLocalDemoFromProduction(): Plugin {
  let enabled = false;
  let root = "";

  const stubs = new Map<string, string>([
    [
      "domain/person-discovery-c4-acceptance.ts",
      `// Replaced at build time by build/local-demo-exclusion-vite-plugin.ts.
// The C4 acceptance seam is development-only; production must never carry its
// synthetic candidates, prospect fixtures, or port symbol.
export const PERSON_DISCOVERY_C4_BINDING_VALUE = "";
export const PERSON_DISCOVERY_C4_PROSPECT_ID = "";
export const PERSON_DISCOVERY_C4_CONTACT_NAME = "";
export function personDiscoveryC4Enabled() { return false; }
export function createPersonDiscoveryC4Service() { return undefined; }
export async function seedPersonDiscoveryC4() {
  throw new Error("person_discovery_c4_unavailable_in_production");
}
`,
    ],
    [
      "app/local-demo-identity.ts",
      `// Replaced at build time by build/local-demo-exclusion-vite-plugin.ts.
// Production has no local-demo owner, so the address itself never ships.
export const LOCAL_DEMO_IDENTITY = null;
`,
    ],
    [
      "app/local-demo/page.tsx",
      `// Replaced at build time by build/local-demo-exclusion-vite-plugin.ts.
import { notFound } from "next/navigation";

export default function LocalDemoUnavailable() {
  notFound();
}
`,
    ],
    [
      "app/api/local-demo/person-discovery-c4/route.ts",
      `// Replaced at build time by build/local-demo-exclusion-vite-plugin.ts.
export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({ error: "not_found" }, { status: 404 });
}
`,
    ],
  ]);

  return {
    name: "prospector:exclude-local-demo-from-production",
    apply: "build",
    configResolved(config) {
      root = config.root;
      // Only a production build excludes these. A development build, and the
      // browser-acceptance lane that drives the C4 journey, must keep them.
      enabled = config.mode === "production" && !config.env?.DEV;
    },
    load(id) {
      if (!enabled) return null;
      const withoutQuery = id.split("?")[0];
      if (!withoutQuery.startsWith("/")) return null;
      const key = relative(root, resolve(withoutQuery)).split("\\").join("/");
      const stub = stubs.get(key);
      return stub === undefined ? null : stub;
    },
  };
}

/** The exact module ids this plugin replaces, for the boundary test to assert. */
export const PRODUCTION_EXCLUDED_MODULES = Object.freeze([
  "domain/person-discovery-c4-acceptance.ts",
  "app/local-demo-identity.ts",
  "app/local-demo/page.tsx",
  "app/api/local-demo/person-discovery-c4/route.ts",
]);
