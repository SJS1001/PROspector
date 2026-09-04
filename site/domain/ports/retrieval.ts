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
