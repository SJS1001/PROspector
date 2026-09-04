import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createServer } from "vite";

const ISSUER = "https://prospector-test.cloudflareaccess.com";
const AUDIENCE = "a".repeat(64);
const NOW_SECONDS = 1_800_000_000;

test("Cloudflare Access verifies a signed owner identity and caches the issuer JWKS", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const access = await vite.ssrLoadModule(
      new URL("../app/cloudflare-access.ts", import.meta.url).pathname,
    );
    const fixture = await signedFixture();
    let fetchCount = 0;
    const fetcher = async (input) => {
      fetchCount += 1;
      assert.equal(String(input), `${ISSUER}/cdn-cgi/access/certs`);
      return Response.json({ keys: [fixture.publicJwk] });
    };
    const token = await fixture.sign({
      iss: ISSUER,
      aud: AUDIENCE,
      email: " Owner@Example.com ",
      iat: NOW_SECONDS - 30,
      nbf: NOW_SECONDS - 30,
      exp: NOW_SECONDS + 300,
    });
    const headers = new Headers({ "cf-access-jwt-assertion": token });
    const config = { issuer: ISSUER, audience: AUDIENCE };
    const dependencies = { fetcher, now: () => NOW_SECONDS * 1000 };

    assert.deepEqual(
      await access.verifyCloudflareAccessIdentity(headers, config, dependencies),
      { email: "owner@example.com", displayName: "owner@example.com" },
    );
    assert.deepEqual(
      await access.verifyCloudflareAccessIdentity(headers, config, dependencies),
      { email: "owner@example.com", displayName: "owner@example.com" },
    );
    const arrayAudienceToken = await fixture.sign({
      iss: ISSUER,
      aud: ["unrelated-audience", AUDIENCE],
      email: "owner@example.com",
      exp: NOW_SECONDS + 300,
    });
    assert.deepEqual(
      await access.verifyCloudflareAccessIdentity(
        new Headers({
          "cf-access-jwt-assertion": arrayAudienceToken,
          "oai-authenticated-user-email": "spoofed@example.com",
        }),
        config,
        dependencies,
      ),
      { email: "owner@example.com", displayName: "owner@example.com" },
    );
    assert.equal(fetchCount, 1);
  } finally {
    await vite.close();
  }
});

test("Cloudflare Access rejects malformed configuration, claims, signatures, and headers", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const access = await vite.ssrLoadModule(
      new URL("../app/cloudflare-access.ts", import.meta.url).pathname,
    );
    const fixture = await signedFixture();
    let uniqueIssuer = 0;
    const verify = async ({
      claims = {},
      config = {},
      header = {},
      token = null,
      publicJwk = fixture.publicJwk,
    } = {}) => {
      uniqueIssuer += 1;
      const issuer = `${ISSUER.slice(0, -".cloudflareaccess.com".length)}-${uniqueIssuer}.cloudflareaccess.com`;
      const defaultClaims = {
        iss: issuer,
        aud: AUDIENCE,
        email: "owner@example.com",
        iat: NOW_SECONDS - 30,
        nbf: NOW_SECONDS - 30,
        exp: NOW_SECONDS + 300,
      };
      const assertion = token ?? await fixture.sign({ ...defaultClaims, ...claims }, header);
      return access.verifyCloudflareAccessIdentity(
        new Headers(assertion ? { "cf-access-jwt-assertion": assertion } : {}),
        { issuer, audience: AUDIENCE, ...config },
        {
          now: () => NOW_SECONDS * 1000,
          fetcher: async () => Response.json({ keys: [publicJwk] }),
        },
      );
    };

    assert.equal(await verify({ token: "" }), null);
    assert.equal(await verify({ token: "not.a.jwt" }), null);
    assert.equal(await verify({ config: { issuer: "http://prospector-test.cloudflareaccess.com" } }), null);
    assert.equal(await verify({ config: { audience: "short" } }), null);
    assert.equal(await verify({ header: { alg: "none" } }), null);
    assert.equal(await verify({ header: { kid: "other-key" } }), null);
    assert.equal(await verify({ claims: { iss: "https://other.cloudflareaccess.com" } }), null);
    assert.equal(await verify({ claims: { aud: "b".repeat(64) } }), null);
    assert.equal(await verify({ claims: { exp: NOW_SECONDS } }), null);
    assert.equal(await verify({ claims: { nbf: NOW_SECONDS + 1 } }), null);
    assert.equal(await verify({ claims: { email: "not-an-email" } }), null);

    const otherFixture = await signedFixture();
    assert.equal(await verify({ publicJwk: otherFixture.publicJwk }), null);
  } finally {
    await vite.close();
  }
});

test("explicit identity modes never fall back across Cloudflare, Sites, or LOCAL_DEMO", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const identity = await vite.ssrLoadModule(
      new URL("../app/runtime-identity.ts", import.meta.url).pathname,
    );
    const sitesHeaders = new Headers({
      "oai-authenticated-user-email": "spoofed@example.com",
      "oai-authenticated-user-full-name": "Spoofed Owner",
    });
    const request = new Request("http://localhost:8788/api/interview", {
      headers: sitesHeaders,
    });

    assert.equal(
      await identity.resolveRuntimeIdentity(
        request,
        sitesHeaders,
        {
          TRUSTED_IDENTITY_PROVIDER: "cloudflare-access",
          LOCAL_DEMO: "1",
          CLOUDFLARE_ACCESS_ISSUER: ISSUER,
          CLOUDFLARE_ACCESS_AUDIENCE: AUDIENCE,
        },
        { fetcher: async () => { throw new Error("must not fetch without a JWT"); } },
      ),
      null,
    );
    assert.equal(
      await identity.resolveRuntimeIdentity(
        request,
        sitesHeaders,
        {
          TRUSTED_IDENTITY_PROVIDER: "cloudflare-access",
          CLOUDFLARE_ACCESS_AUDIENCE: AUDIENCE,
        },
      ),
      null,
    );
    assert.equal(
      await identity.resolveRuntimeIdentity(
        request,
        sitesHeaders,
        {
          TRUSTED_IDENTITY_PROVIDER: "cloudflare-access",
          CLOUDFLARE_ACCESS_ISSUER: ISSUER,
        },
      ),
      null,
    );
    assert.equal(
      await identity.resolveRuntimeIdentity(request, sitesHeaders, {}),
      null,
    );
    assert.equal(
      await identity.resolveRuntimeIdentity(
        request,
        sitesHeaders,
        {
          CLOUDFLARE_ACCESS_ISSUER: ISSUER,
          CLOUDFLARE_ACCESS_AUDIENCE: AUDIENCE,
        },
      ),
      null,
    );
    assert.deepEqual(
      await identity.resolveRuntimeIdentity(
        request,
        sitesHeaders,
        { TRUSTED_IDENTITY_PROVIDER: "sites" },
      ),
      { email: "spoofed@example.com", displayName: "spoofed@example.com" },
    );

    const demoBindings = {
      TRUSTED_IDENTITY_PROVIDER: "local-demo",
      LOCAL_DEMO: "1",
    };
    assert.deepEqual(
      await identity.resolveRuntimeIdentity(
        new Request("http://localhost:8788/api/interview", {
          method: "POST",
          headers: { origin: "http://localhost:8788" },
        }),
        new Headers({ origin: "http://localhost:8788" }),
        demoBindings,
      ),
      { email: "local-owner@prospector.invalid", displayName: "Local Demo Owner" },
    );
    for (const origin of [
      "https://localhost:8788",
      "http://localhost:8789",
      "not a valid origin",
    ]) {
      const hostileHeaders = new Headers({
        origin,
        "oai-authenticated-user-email": "owner@example.com",
      });
      assert.equal(
        await identity.resolveRuntimeIdentity(
          new Request("http://localhost:8788/api/interview", {
            method: "POST",
            headers: hostileHeaders,
          }),
          hostileHeaders,
          demoBindings,
        ),
        null,
      );
    }
  } finally {
    await vite.close();
  }
});

test("JWKS refresh is single-flight and supports bounded same-kid rotation", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const access = await vite.ssrLoadModule(
      new URL("../app/cloudflare-access.ts", import.meta.url).pathname,
    );
    const issuer = "https://rotation-test.cloudflareaccess.com";
    const oldFixture = await signedFixture("rotation-key");
    const newFixture = await signedFixture("rotation-key");
    let activeJwk = oldFixture.publicJwk;
    let now = NOW_SECONDS * 1000;
    let fetchCount = 0;
    const dependencies = {
      now: () => now,
      fetcher: async () => {
        fetchCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return Response.json({ keys: [activeJwk] });
      },
    };
    const config = { issuer, audience: AUDIENCE };
    const claims = {
      iss: issuer,
      aud: AUDIENCE,
      email: "owner@example.com",
      exp: NOW_SECONDS + 600,
    };
    const oldToken = await oldFixture.sign(claims);
    assert.ok(await access.verifyCloudflareAccessIdentity(
      new Headers({ "cf-access-jwt-assertion": oldToken }),
      config,
      dependencies,
    ));
    assert.equal(fetchCount, 1);

    activeJwk = newFixture.publicJwk;
    now += 31_000;
    const newToken = await newFixture.sign(claims);
    assert.ok(await access.verifyCloudflareAccessIdentity(
      new Headers({ "cf-access-jwt-assertion": newToken }),
      config,
      dependencies,
    ));
    assert.equal(fetchCount, 2);

    now += 31_000;
    const unknownTokens = await Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const fixture = await signedFixture(`unknown-key-${index}`);
        return fixture.sign(claims);
      }),
    );
    const results = await Promise.all(unknownTokens.map((token) =>
      access.verifyCloudflareAccessIdentity(
        new Headers({ "cf-access-jwt-assertion": token }),
        config,
        dependencies,
      )));
    assert.deepEqual(results, Array(12).fill(null));
    assert.equal(fetchCount, 3);
  } finally {
    await vite.close();
  }
});

test("failed JWKS refreshes cannot extend the fixed stale-key deadline", async () => {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  try {
    const access = await vite.ssrLoadModule(
      new URL("../app/cloudflare-access.ts", import.meta.url).pathname,
    );
    const issuer = "https://stale-deadline-test.cloudflareaccess.com";
    const fixture = await signedFixture("stale-key");
    let now = NOW_SECONDS * 1000;
    let available = true;
    const dependencies = {
      now: () => now,
      fetcher: async () => available
        ? Response.json({ keys: [fixture.publicJwk] })
        : new Response("unavailable", { status: 503 }),
    };
    const token = await fixture.sign({
      iss: issuer,
      aud: AUDIENCE,
      email: "owner@example.com",
      exp: NOW_SECONDS + 3_600,
    });
    const headers = new Headers({ "cf-access-jwt-assertion": token });
    const config = { issuer, audience: AUDIENCE };

    assert.ok(await access.verifyCloudflareAccessIdentity(headers, config, dependencies));
    available = false;
    now += 5 * 60 * 1000 + 1;
    assert.ok(await access.verifyCloudflareAccessIdentity(headers, config, dependencies));
    now += 5 * 60 * 1000;
    assert.equal(
      await access.verifyCloudflareAccessIdentity(headers, config, dependencies),
      null,
    );
    now += 31_000;
    assert.equal(
      await access.verifyCloudflareAccessIdentity(headers, config, dependencies),
      null,
    );
  } finally {
    await vite.close();
  }
});

test("every owner-facing runtime identity caller supplies the Cloudflare bindings", async () => {
  const files = [
    "app/api/capability-runtime.ts",
    "app/api/contacts/route.ts",
    "app/api/discovery/route.ts",
    "app/api/interview/route.ts",
    "app/api/knowledge/route.ts",
    "app/api/prospecting/route.ts",
    "app/contacts/page.tsx",
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /TRUSTED_IDENTITY_PROVIDER|RuntimeIdentityBindings/, `${file} must bind the provider mode`);
    assert.match(source, /CLOUDFLARE_ACCESS_ISSUER|RuntimeIdentityBindings/, `${file} must bind the Access issuer`);
    assert.match(source, /CLOUDFLARE_ACCESS_AUDIENCE|RuntimeIdentityBindings/, `${file} must bind the Access audience`);
    assert.match(source, /runtimeIdentity\([^)]*bindings|runtimeIdentity\([^)]*, b\)/s, `${file} must pass the complete identity bindings`);
  }
});

async function signedFixture(kid = "test-key-1") {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const publicJwk = {
    ...await crypto.subtle.exportKey("jwk", keyPair.publicKey),
    alg: "RS256",
    kid,
    use: "sig",
  };
  return {
    publicJwk,
    async sign(claims, header = {}) {
      const encodedHeader = encode({ alg: "RS256", kid, typ: "JWT", ...header });
      const encodedPayload = encode(claims);
      const material = `${encodedHeader}.${encodedPayload}`;
      const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        keyPair.privateKey,
        new TextEncoder().encode(material),
      );
      return `${material}.${base64url(new Uint8Array(signature))}`;
    },
  };
}

function encode(value) {
  return base64url(new TextEncoder().encode(JSON.stringify(value)));
}

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
