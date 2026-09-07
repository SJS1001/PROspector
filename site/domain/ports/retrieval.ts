/**
 * Deliberately inert seam for a future retrieval capability.  It is not a
 * browser, credential container, proxy, or network client; composition must
 * remain reject-only until a separately accepted capability gate exists.
 */
export type RetrievalRequest = Readonly<{
  url: string;
  expectedMimeTypes: readonly string[];
  maximumBytes: number;
  maximumRedirects: number;
  timeoutMs: number;
  /** Future adapters must validate every redirect before connecting and pin its public resolution. */
  maximumDecompressedBytes?: number;
}>;

export type RetrievedDocument = Readonly<{
  finalUrl: string;
  mimeType: string;
  contentDigest: string;
  extractedText: string;
}>;

export type RetrievalPort = Readonly<{
  retrieve(request: RetrievalRequest): Promise<RetrievedDocument>;
}>;

export const SAFE_RETRIEVAL_REQUIREMENTS = Object.freeze([
  "https_only", "public_address_and_redirect_validation", "dns_connection_pinning",
  "mime_byte_decompression_and_timeout_caps", "bounded_redirects_and_wall_clock_timeout", "sandboxed_text_extraction", "escaped_text_only",
  "no_cookies_credentials_or_privileged_browser_authority",
] as const);

export function createRejectOnlyRetrievalPort(): RetrievalPort {
  return Object.freeze({ async retrieve(): Promise<RetrievedDocument> { throw new Error("retrieval_capability_unavailable"); } });
}

/* ---------------------------------------------------------------------------
 * Executable admission control for the same seam.
 *
 * The requirement labels above are inert prose on their own: nothing stopped a
 * future adapter from being handed an unbounded plaintext request or from
 * returning executable source text.  The pure, total functions below make each
 * label enforceable now, before any transport exists.  They perform no I/O, no
 * DNS resolution, and no network call; they only admit or reject already
 * supplied values, and every unrecognised shape fails closed.
 * ------------------------------------------------------------------------- */

export class RetrievalAdmissionError extends Error {
  readonly code = "retrieval_admission_rejected";
  readonly rule: string;
  constructor(rule: string) { super("retrieval_admission_rejected"); this.rule = rule; }
}

/** Each safe-adapter requirement is bound to the check that actually enforces it. */
export const RETRIEVAL_ADMISSION_RULES: Readonly<Record<typeof SAFE_RETRIEVAL_REQUIREMENTS[number], readonly string[]>> = Object.freeze({
  https_only: Object.freeze(["request.url.scheme", "document.finalUrl.scheme"]),
  public_address_and_redirect_validation: Object.freeze(["request.url.host", "document.finalUrl.host", "document.finalUrl.redirect", "address.public"]),
  dns_connection_pinning: Object.freeze(["address.pinned"]),
  mime_byte_decompression_and_timeout_caps: Object.freeze(["request.expectedMimeTypes", "request.maximumBytes", "request.maximumDecompressedBytes", "request.timeoutMs", "document.mimeType", "document.extractedText.bytes"]),
  bounded_redirects_and_wall_clock_timeout: Object.freeze(["request.maximumRedirects", "request.timeoutMs"]),
  sandboxed_text_extraction: Object.freeze(["document.extractedText.control", "document.contentDigest"]),
  escaped_text_only: Object.freeze(["document.extractedText.escaped"]),
  no_cookies_credentials_or_privileged_browser_authority: Object.freeze(["request.shape", "request.url.credentials", "document.shape"]),
});

const REQUEST_KEYS = Object.freeze(["url", "expectedMimeTypes", "maximumBytes", "maximumRedirects", "timeoutMs", "maximumDecompressedBytes"] as const);
const DOCUMENT_KEYS = Object.freeze(["finalUrl", "mimeType", "contentDigest", "extractedText"] as const);
/** Closed set: no wildcards, no parameters, and no binary or scriptable type. */
const ALLOWED_MIME_TYPES = Object.freeze(["application/json", "application/xhtml+xml", "text/html", "text/plain"] as const);
/**
 * Private-network and overlay name spaces never describe a public source.  The
 * reserved documentation suffixes are deliberately absent: they are admissible
 * names that simply do not resolve, which keeps synthetic fixtures consistent
 * with `source-policy.ts` while the pinned-address checks below do the real
 * anti-SSRF work.
 */
const PRIVATE_HOST_SUFFIXES = Object.freeze(["local", "localhost", "localdomain", "internal", "intranet", "lan", "home", "corp", "private", "onion"] as const);
const MAX_URL_LENGTH = 2048;
const MAX_BYTES_CAP = 5_000_000;
const MAX_REDIRECTS_CAP = 3;
const MAX_TIMEOUT_MS_CAP = 15_000;
const MAX_DECOMPRESSED_BYTES_CAP = 20_000_000;
const MAX_DECOMPRESSION_RATIO = 20;
const MAX_RESOLVED_ADDRESSES = 8;

export type AdmittedRetrievalRequest = Readonly<{
  url: string;
  expectedMimeTypes: readonly string[];
  maximumBytes: number;
  maximumRedirects: number;
  timeoutMs: number;
  maximumDecompressedBytes: number;
}>;

/**
 * Admit one retrieval request.  Unknown properties are rejected outright so a
 * caller can never smuggle cookies, headers, credentials, a proxy, or a browser
 * profile through this seam, and every bound is resolved to an explicit value.
 */
export function admitRetrievalRequest(value: RetrievalRequest | unknown): AdmittedRetrievalRequest {
  const request = closedRecord(value, REQUEST_KEYS, "request.shape");
  const url = admitPublicHttpsUrl(request.url, "request.url");
  const expectedMimeTypes = admitMimeTypes(request.expectedMimeTypes);
  const maximumBytes = boundedInteger(request.maximumBytes, 1, MAX_BYTES_CAP, "request.maximumBytes");
  const maximumRedirects = boundedInteger(request.maximumRedirects, 0, MAX_REDIRECTS_CAP, "request.maximumRedirects");
  const timeoutMs = boundedInteger(request.timeoutMs, 1, MAX_TIMEOUT_MS_CAP, "request.timeoutMs");
  const maximumDecompressedBytes = request.maximumDecompressedBytes === undefined
    ? maximumBytes
    : boundedInteger(request.maximumDecompressedBytes, maximumBytes, MAX_DECOMPRESSED_BYTES_CAP, "request.maximumDecompressedBytes");
  if (maximumDecompressedBytes > maximumBytes * MAX_DECOMPRESSION_RATIO) throw new RetrievalAdmissionError("request.maximumDecompressedBytes");
  return Object.freeze({ url, expectedMimeTypes, maximumBytes, maximumRedirects, timeoutMs, maximumDecompressedBytes });
}

/**
 * Admit one already retrieved document against the exact admitted request.  A
 * future adapter's output is untrusted data: an unexpected media type, an
 * unescaped excerpt, an oversized body, or a redirect the request never allowed
 * is rejected before it can become evidence.
 */
export function admitRetrievedDocument(request: AdmittedRetrievalRequest, value: RetrievedDocument | unknown): RetrievedDocument {
  const admittedRequest = admitRetrievalRequest(request);
  const document = closedRecord(value, DOCUMENT_KEYS, "document.shape");
  const finalUrl = admitPublicHttpsUrl(document.finalUrl, "document.finalUrl");
  if (admittedRequest.maximumRedirects === 0 && finalUrl !== admittedRequest.url) throw new RetrievalAdmissionError("document.finalUrl.redirect");
  const mimeType = typeof document.mimeType === "string" ? document.mimeType : "";
  if (!admittedRequest.expectedMimeTypes.includes(mimeType)) throw new RetrievalAdmissionError("document.mimeType");
  if (typeof document.contentDigest !== "string" || !/^[0-9a-f]{64}$/.test(document.contentDigest)) throw new RetrievalAdmissionError("document.contentDigest");
  const extractedText = admitExtractedText(document.extractedText, admittedRequest.maximumBytes);
  return Object.freeze({ finalUrl, mimeType, contentDigest: document.contentDigest, extractedText });
}

/**
 * A future adapter must resolve the host itself and connect only to a pinned,
 * publicly routable address.  This admits that pinned set without resolving
 * anything: an empty, oversized, duplicated, or non-public set fails closed.
 */
export function admitResolvedAddresses(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_RESOLVED_ADDRESSES) throw new RetrievalAdmissionError("address.pinned");
  const pinned: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || !isPubliclyRoutableAddress(candidate)) throw new RetrievalAdmissionError("address.public");
    const normalized = candidate.trim().toLowerCase();
    if (pinned.includes(normalized)) throw new RetrievalAdmissionError("address.pinned");
    pinned.push(normalized);
  }
  return Object.freeze(pinned.sort());
}

/** Conservative public-routability test: only global unicast space is accepted. */
export function isPubliclyRoutableAddress(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const address = value.trim().toLowerCase();
  if (!address || address.length > 45) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return isPublicIpv4(address);
  return isPublicIpv6(address);
}

/**
 * Wrap any adapter so the seam's rules apply on both sides.  The request is
 * admitted before the adapter is reachable, so an inadmissible request can
 * never become a connection attempt, and the adapter's answer is admitted
 * before it is returned.  Guarding the reject-only port still rejects.
 */
export function createGuardedRetrievalPort(adapter: RetrievalPort): RetrievalPort {
  if (!adapter || typeof adapter !== "object" || typeof (adapter as RetrievalPort).retrieve !== "function") throw new RetrievalAdmissionError("adapter.shape");
  return Object.freeze({
    async retrieve(request: RetrievalRequest): Promise<RetrievedDocument> {
      const admitted = admitRetrievalRequest(request);
      return admitRetrievedDocument(admitted, await adapter.retrieve(admitted));
    },
  });
}

function admitPublicHttpsUrl(value: unknown, rule: string): string {
  if (typeof value !== "string" || !value || value.length > MAX_URL_LENGTH || value !== value.trim()) throw new RetrievalAdmissionError(rule);
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new RetrievalAdmissionError(rule); }
  if (parsed.protocol !== "https:") throw new RetrievalAdmissionError(`${rule}.scheme`);
  if (parsed.username || parsed.password) throw new RetrievalAdmissionError(`${rule}.credentials`);
  if (parsed.port) throw new RetrievalAdmissionError(`${rule}.host`);
  admitPublicHostname(parsed.hostname, `${rule}.host`);
  parsed.hash = "";
  return parsed.toString();
}

function admitPublicHostname(hostname: string, rule: string): void {
  // Address literals are refused entirely: a source must be a resolvable name so
  // the adapter's own pinned public-address check remains the only address path.
  if (!hostname || hostname.length > 253 || hostname.startsWith("[") || hostname.endsWith(".")) throw new RetrievalAdmissionError(rule);
  const labels = hostname.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new RetrievalAdmissionError(rule);
  const suffix = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(suffix) || (PRIVATE_HOST_SUFFIXES as readonly string[]).includes(suffix)) throw new RetrievalAdmissionError(rule);
}

function admitMimeTypes(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > ALLOWED_MIME_TYPES.length) throw new RetrievalAdmissionError("request.expectedMimeTypes");
  const accepted: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== "string" || !(ALLOWED_MIME_TYPES as readonly string[]).includes(candidate) || accepted.includes(candidate)) throw new RetrievalAdmissionError("request.expectedMimeTypes");
    accepted.push(candidate);
  }
  return Object.freeze(accepted.sort());
}

function admitExtractedText(value: unknown, maximumBytes: number): string {
  if (typeof value !== "string") throw new RetrievalAdmissionError("document.extractedText");
  if (new TextEncoder().encode(value).byteLength > maximumBytes) throw new RetrievalAdmissionError("document.extractedText.bytes");
  // Sandboxed extraction yields inert text: no control bytes and no markup that a
  // later renderer could execute.  Only the five known entity forms may appear.
  if (/[\u0000-\u0008\u000B-\u001F\u007F]/u.test(value)) throw new RetrievalAdmissionError("document.extractedText.control");
  if (/[<>"']/.test(value) || /&(?!(?:amp|lt|gt|quot|#39);)/.test(value)) throw new RetrievalAdmissionError("document.extractedText.escaped");
  return value;
}

function closedRecord<Key extends string>(value: unknown, keys: readonly Key[], rule: string): Record<Key, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RetrievalAdmissionError(rule);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!(keys as readonly string[]).includes(key)) throw new RetrievalAdmissionError(rule);
  return record as Record<Key, unknown>;
}

function boundedInteger(value: unknown, minimum: number, maximum: number, rule: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new RetrievalAdmissionError(rule);
  return value as number;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map((octet) => (/^(?:0|[1-9]\d{0,2})$/.test(octet) ? Number(octet) : -1));
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  const [first, second, third] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 192 && second === 0 && (third === 0 || third === 2)) return false;
  if (first === 192 && second === 88 && third === 99) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const hextets = expandIpv6(address);
  // Everything outside global unicast 2000::/3 fails closed, which also excludes
  // the unspecified, loopback, IPv4-mapped, unique-local, link-local, and
  // multicast ranges without enumerating each of them.
  return hextets !== null && hextets[0] >= 0x2000 && hextets[0] <= 0x3fff;
}

function expandIpv6(address: string): number[] | null {
  if (!/^[0-9a-f:]+$/.test(address) || address.includes(":::")) return null;
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  if (halves.length === 2 && head.length + tail.length >= 8) return null;
  const groups = [...head, ...Array<string>(8 - head.length - tail.length).fill("0"), ...tail];
  const hextets = groups.map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : -1));
  return hextets.some((hextet) => hextet < 0) ? null : hextets;
}
