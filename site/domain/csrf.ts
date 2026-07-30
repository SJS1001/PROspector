export class CsrfTokenError extends Error {
  readonly code = "invalid_csrf_token";
}

export const CSRF_COOKIE_NAME = "__Host-prospector-csrf";

export function csrfTokenFromRequest(request: Request): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const name = part.slice(0, separator).trim();
    if (name === CSRF_COOKIE_NAME) return part.slice(separator + 1).trim();
  }
  return "";
}

export function csrfCookie(token: string): string {
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; Max-Age=900; HttpOnly; Secure; SameSite=Strict`;
}

export function withCsrfCookie(response: Response, token: string): Response {
  response.headers.append("set-cookie", csrfCookie(token));
  return response;
}

export async function issueCsrfToken(
  database: D1Database,
  principalSubject: string,
): Promise<string> {
  const token = randomToken();
  const digest = await sha256(token);
  const now = Date.now();
  const expiresAt = now + 15 * 60 * 1000;
  await database.batch([
    database
      .prepare(
        `INSERT INTO csrf_tokens
         (id, principal_subject, token_digest, expires_at, used_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      )
      .bind(`ct_${digest.slice(0, 24)}`, principalSubject, digest, expiresAt, now),
    database
      .prepare(
        "DELETE FROM csrf_tokens WHERE (used_at IS NOT NULL OR expires_at < ?) AND created_at < ?",
      )
      .bind(now, now - 24 * 60 * 60 * 1000),
  ]);
  return token;
}

export async function consumeCsrfToken(
  database: D1Database,
  principalSubject: string,
  token: string,
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new CsrfTokenError("Invalid token");
  const digest = await sha256(token);
  const now = Date.now();
  const result = await database
    .prepare(
      `UPDATE csrf_tokens SET used_at = ?
       WHERE token_digest = ? AND principal_subject = ?
         AND used_at IS NULL AND expires_at > ?`,
    )
    .bind(now, digest, principalSubject, now)
    .run();
  if (result.meta.changes !== 1) throw new CsrfTokenError("Invalid token");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
