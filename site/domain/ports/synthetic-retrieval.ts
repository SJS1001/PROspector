import type { RetrievalPort, RetrievalRequest, RetrievedDocument } from "./retrieval";

/**
 * Bounded synthetic `RetrievalPort` candidate for the LOCAL_DEMO Consensus
 * Interview. It performs no network I/O: every response is served from a
 * fixed, immutable fixture set so a demo operator can see the shape of a
 * sourced Research Finding without a real retrieval capability existing.
 * Callers must pass the literal "local-demo" mode; every other composition
 * stays reject-only, matching `createRejectOnlyRetrievalPort`.
 */

type LocalDemoMode = "local-demo";

type Fixture = Readonly<{
  finalUrl: string;
  mimeType: "text/plain";
  extractedText: string;
}>;

const SOURCE_URL = /^https:\/\/research\.prospector\.invalid\/fixtures\/[a-z-]{1,64}$/u;
const REQUEST_KEYS = new Set([
  "url", "expectedMimeTypes", "maximumBytes", "maximumRedirects", "timeoutMs", "maximumDecompressedBytes",
]);
const REQUIRED_REQUEST_KEYS = ["url", "expectedMimeTypes", "maximumBytes", "maximumRedirects", "timeoutMs"];

const FIXTURES: readonly Fixture[] = Object.freeze([
  Object.freeze({
    finalUrl: "https://research.prospector.invalid/fixtures/product-capability-overview",
    mimeType: "text/plain",
    extractedText:
      "[SYNTHETIC DEMO CONTENT] This fixture stands in for a sourced product page during LOCAL_DEMO. "
      + "It names one fictional capability, one fictional limitation, and one fictional proof point. "
      + "No real company, product, or claim is represented. Treat it as Proposed Knowledge only.",
  }),
  Object.freeze({
    finalUrl: "https://research.prospector.invalid/fixtures/market-context-note",
    mimeType: "text/plain",
    extractedText:
      "[SYNTHETIC DEMO CONTENT] This fixture stands in for background market context during LOCAL_DEMO. "
      + "It names one fictional industry trend and one fictional buying trigger. "
      + "No real market, organization, or event is represented. Treat it as Account Context only.",
  }),
  Object.freeze({
    finalUrl: "https://research.prospector.invalid/fixtures/customer-signal-example",
    mimeType: "text/plain",
    extractedText:
      "[SYNTHETIC DEMO CONTENT] This fixture stands in for a sourced customer signal during LOCAL_DEMO. "
      + "It names one fictional pain point and one fictional role title. "
      + "No real person, organization, or event is represented. Treat it as a Signal only after Qualification.",
  }),
]);

const FIXTURES_BY_URL: ReadonlyMap<string, Fixture> = new Map(FIXTURES.map((fixture) => [fixture.finalUrl, fixture]));

export function createSyntheticRetrievalPort(mode: LocalDemoMode): RetrievalPort {
  if (mode !== "local-demo") throw new Error("synthetic_retrieval_mode_required");
  return Object.freeze({
    async retrieve(request: RetrievalRequest): Promise<RetrievedDocument> {
      const normalized = normalizeRequest(request);
      const fixture = FIXTURES_BY_URL.get(normalized.url);
      if (!fixture) throw new Error("synthetic_retrieval_source_unavailable");
      if (byteLength(fixture.extractedText) > normalized.maximumBytes) throw new Error("synthetic_retrieval_source_unavailable");
      const contentDigest = await sha256(fixture.extractedText);
      return Object.freeze({
        finalUrl: fixture.finalUrl,
        mimeType: fixture.mimeType,
        contentDigest,
        extractedText: fixture.extractedText,
      });
    },
  });
}

function normalizeRequest(value: unknown): Readonly<{ url: string; maximumBytes: number }> {
  if (!isPlainObject(value)) invalid();
  const keys = Object.keys(value);
  if (keys.some((key) => !REQUEST_KEYS.has(key))) invalid();
  if (REQUIRED_REQUEST_KEYS.some((key) => !(key in value))) invalid();

  const url = value.url;
  if (typeof url !== "string" || !SOURCE_URL.test(url)) invalid();

  const expectedMimeTypes = value.expectedMimeTypes;
  if (!Array.isArray(expectedMimeTypes) || expectedMimeTypes.length === 0 || expectedMimeTypes.length > 8) invalid();
  if (!expectedMimeTypes.every((entry) => typeof entry === "string") || !expectedMimeTypes.includes("text/plain")) invalid();

  const maximumBytes = value.maximumBytes;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0 || maximumBytes > 10_000_000) invalid();

  const maximumRedirects = value.maximumRedirects;
  if (!Number.isSafeInteger(maximumRedirects) || maximumRedirects < 0 || maximumRedirects > 10) invalid();

  const timeoutMs = value.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) invalid();

  if ("maximumDecompressedBytes" in value) {
    const maximumDecompressedBytes = value.maximumDecompressedBytes;
    if (!Number.isSafeInteger(maximumDecompressedBytes) || (maximumDecompressedBytes as number) <= 0 || (maximumDecompressedBytes as number) > 10_000_000) invalid();
  }

  return Object.freeze({ url, maximumBytes: maximumBytes as number });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function invalid(): never {
  throw new Error("synthetic_retrieval_request_invalid");
}
