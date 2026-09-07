import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

// `generateMetadata` builds `metadataBase` and the absolute Open Graph and
// Twitter image URLs from the request host. The Cloudflare Worker is the edge
// (worker/index.ts), so nothing upstream sets `x-forwarded-*`; honouring those
// headers only accepts values an attacker injected. `app/runtime-identity.ts`
// already ignores them for identity -- this closes the same hole in metadata.

const FORGED_HOST = "evil.example";
const REAL_HOST = "localhost:8788";
const EXPECTED_ORIGIN = `http://${REAL_HOST}`;

test("forwarded host and proto headers cannot reach metadataBase or the absolute image URLs", async () => {
  const metadata = await generateMetadataWith({
    "x-forwarded-host": FORGED_HOST,
    "x-forwarded-proto": "https",
    host: REAL_HOST,
  });

  assert.equal(metadata.metadataBase.origin, EXPECTED_ORIGIN);
  assert.equal(metadata.openGraph.images[0].url, `${EXPECTED_ORIGIN}/og.png`);
  assert.equal(metadata.twitter.images[0], `${EXPECTED_ORIGIN}/og.png`);

  // Nothing anywhere in the emitted metadata may carry the injected authority.
  assert.doesNotMatch(JSON.stringify(metadata), new RegExp(FORGED_HOST));
});

async function generateMetadataWith(requestHeaders) {
  globalThis.__prospectorLayoutTestHeaders = requestHeaders;
  // `next/headers` is bare-specifier externalised for SSR, so a plugin
  // `resolveId` never sees it; the alias has to intercept it first.
  const server = await createServer({
    configFile: false,
    logLevel: "silent",
    // `app/layout.tsx` imports globals.css; the CSS transform needs a server.
    server: { middlewareMode: true },
    resolve: { alias: { "next/headers": "virtual:test-layout-headers" } },
    plugins: [{
      name: "test-layout-metadata-boundary",
      resolveId(id) {
        if (id === "virtual:test-layout-headers") return "\0test-layout-headers";
      },
      load(id) {
        if (id === "\0test-layout-headers") return "export const headers = async () => new Headers(globalThis.__prospectorLayoutTestHeaders)";
      },
    }],
  });
  try {
    const layout = await server.ssrLoadModule(new URL("../app/layout.tsx", import.meta.url).pathname);
    return await layout.generateMetadata();
  } finally {
    await server.close();
    delete globalThis.__prospectorLayoutTestHeaders;
  }
}
