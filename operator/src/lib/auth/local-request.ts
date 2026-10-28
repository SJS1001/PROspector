/** Pure request guard shared by HTTP auth and all owner-scoped server functions. */
export const LOCAL_ORIGIN = "http://127.0.0.1:8080";
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: local origin required");
    this.name = "CrossSiteRequestError";
  }
}
export function assertLocalRequest(request: Request): void {
  const h = request.headers;
  const url = new URL(request.url);
  if (
    url.origin !== LOCAL_ORIGIN ||
    h.get("host") !== "127.0.0.1:8080" ||
    h.has("forwarded") ||
    h.has("x-forwarded-host") ||
    h.has("x-forwarded-proto")
  ) {
    throw new CrossSiteRequestError();
  }
  const origin = h.get("origin");
  if (origin !== null && origin !== LOCAL_ORIGIN) throw new CrossSiteRequestError();
  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new CrossSiteRequestError();
  if (request.method !== "GET" && request.method !== "HEAD" && origin !== LOCAL_ORIGIN) {
    throw new CrossSiteRequestError();
  }
}
