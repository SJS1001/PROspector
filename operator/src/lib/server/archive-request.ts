/** Archive endpoints are local-only, authenticated, same-origin POST actions.
 * Keep these checks in addition to the shared authentication middleware. */
export function assertArchiveRequest(request: Request | undefined, ownerId: unknown): void {
  if (typeof ownerId !== "string" || !ownerId || ownerId === "dev-user") {
    throw new Error("Sign in as the workspace owner before backing up or restoring.");
  }
  if (!request) throw new Error("Archive request context is required.");
  const url = new URL(request.url);
  const site = request.headers.get("sec-fetch-site");
  if (
    request.method !== "POST" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    request.headers.get("origin") !== url.origin ||
    (site !== null && site !== "same-origin")
  ) {
    throw new Error("Archive requests must come from this local app's origin.");
  }
}

export const MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;

export function parseArchiveInput(input: unknown): unknown {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== 1 ||
    !("json" in input) ||
    typeof input.json !== "string"
  ) {
    throw new Error("Choose a workspace archive JSON file.");
  }
  if (Buffer.byteLength(input.json, "utf8") > MAX_ARCHIVE_BYTES) {
    throw new Error("Workspace archives must be at most 20 MiB.");
  }
  try {
    return JSON.parse(input.json);
  } catch {
    throw new Error("That archive is not valid JSON.");
  }
}
