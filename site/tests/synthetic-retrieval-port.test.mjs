import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "..");
const modulePath = resolve(root, "domain/ports/synthetic-retrieval.ts");

async function load() {
  const vite = await createServer({ configFile: false, logLevel: "silent" });
  return { vite, retrieval: await vite.ssrLoadModule(modulePath) };
}

function baseRequest(patch = {}) {
  return {
    url: "https://research.prospector.invalid/fixtures/product-capability-overview",
    expectedMimeTypes: ["text/plain"],
    maximumBytes: 10_000,
    maximumRedirects: 0,
    timeoutMs: 5_000,
    ...patch,
  };
}

test("createSyntheticRetrievalPort requires the literal local-demo mode", async () => {
  const { vite, retrieval } = await load();
  try {
    for (const mode of ["secure", "LOCAL-DEMO", "local_demo", "", null, undefined, "local-demo "]) {
      assert.throws(() => retrieval.createSyntheticRetrievalPort(mode), /synthetic_retrieval_mode_required/);
    }
    assert.doesNotThrow(() => retrieval.createSyntheticRetrievalPort("local-demo"));
  } finally {
    await vite.close();
  }
});

test("retrieve serves every fixture deterministically with a matching content digest", async () => {
  const { vite, retrieval } = await load();
  try {
    const port = retrieval.createSyntheticRetrievalPort("local-demo");
    const urls = [
      "https://research.prospector.invalid/fixtures/product-capability-overview",
      "https://research.prospector.invalid/fixtures/market-context-note",
      "https://research.prospector.invalid/fixtures/customer-signal-example",
    ];
    const seenDigests = new Set();
    for (const url of urls) {
      const document = await port.retrieve(baseRequest({ url }));
      assert.equal(document.finalUrl, url);
      assert.equal(document.mimeType, "text/plain");
      assert.match(document.extractedText, /^\[SYNTHETIC DEMO CONTENT\]/);
      assert.equal(document.contentDigest, createHash("sha256").update(document.extractedText).digest("hex"));
      assert.equal(Object.isFrozen(document), true);
      seenDigests.add(document.contentDigest);

      const second = await port.retrieve(baseRequest({ url }));
      assert.deepEqual(second, document);
    }
    assert.equal(seenDigests.size, urls.length);
  } finally {
    await vite.close();
  }
});

test("retrieve fails closed for a well-formed but unknown source", async () => {
  const { vite, retrieval } = await load();
  try {
    const port = retrieval.createSyntheticRetrievalPort("local-demo");
    await assert.rejects(
      port.retrieve(baseRequest({ url: "https://research.prospector.invalid/fixtures/unlisted-fixture" })),
      /synthetic_retrieval_source_unavailable/,
    );
    await assert.rejects(
      port.retrieve(baseRequest({ url: "https://attacker.example/fixtures/product-capability-overview" })),
      /synthetic_retrieval_request_invalid/,
    );
  } finally {
    await vite.close();
  }
});

test("retrieve enforces the caller's maximumBytes cap against the fixture size", async () => {
  const { vite, retrieval } = await load();
  try {
    const port = retrieval.createSyntheticRetrievalPort("local-demo");
    await assert.rejects(
      port.retrieve(baseRequest({ maximumBytes: 4 })),
      /synthetic_retrieval_source_unavailable/,
    );
    await assert.doesNotReject(port.retrieve(baseRequest({ maximumBytes: 10_000 })));
  } finally {
    await vite.close();
  }
});

test("retrieve rejects malformed, hostile, or drifted request shapes", async () => {
  const { vite, retrieval } = await load();
  try {
    const port = retrieval.createSyntheticRetrievalPort("local-demo");
    const cases = [
      null,
      "https://research.prospector.invalid/fixtures/product-capability-overview",
      [],
      baseRequest({ extraField: "unexpected" }),
      (() => { const request = baseRequest(); delete request.url; return request; })(),
      baseRequest({ url: 123 }),
      baseRequest({ url: "http://research.prospector.invalid/fixtures/product-capability-overview" }),
      baseRequest({ url: "https://research.prospector.invalid/fixtures/../escape" }),
      baseRequest({ expectedMimeTypes: [] }),
      baseRequest({ expectedMimeTypes: ["application/pdf"] }),
      baseRequest({ expectedMimeTypes: [1] }),
      baseRequest({ maximumBytes: 0 }),
      baseRequest({ maximumBytes: -1 }),
      baseRequest({ maximumBytes: 1.5 }),
      baseRequest({ maximumBytes: 50_000_000 }),
      baseRequest({ maximumRedirects: -1 }),
      baseRequest({ maximumRedirects: 11 }),
      baseRequest({ timeoutMs: 0 }),
      baseRequest({ timeoutMs: -5 }),
      baseRequest({ maximumDecompressedBytes: 0 }),
      baseRequest({ maximumDecompressedBytes: -1 }),
      Object.assign(Object.create({ polluted: true }), baseRequest()),
    ];
    for (const value of cases) {
      await assert.rejects(port.retrieve(value), /synthetic_retrieval_request_invalid/, JSON.stringify(value));
    }
    await assert.doesNotReject(port.retrieve(baseRequest({ maximumDecompressedBytes: 10_000 })));
  } finally {
    await vite.close();
  }
});

test("the synthetic retrieval candidate performs no network I/O and is not composed into the running application", async () => {
  const source = await readFile(modulePath, "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|cloudflare:workers/);

  const searchRoots = ["app", "domain"];
  for (const relativeRoot of searchRoots) {
    for await (const file of walk(resolve(root, relativeRoot))) {
      if (file === modulePath) continue;
      const contents = await readFile(file, "utf8");
      assert.doesNotMatch(
        contents,
        /synthetic-retrieval/,
        `${file} must not compose the synthetic retrieval candidate into the running application`,
      );
    }
  }
});

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(entryPath);
    } else if (entry.isFile() && (entryPath.endsWith(".ts") || entryPath.endsWith(".tsx"))) {
      yield entryPath;
    }
  }
}
