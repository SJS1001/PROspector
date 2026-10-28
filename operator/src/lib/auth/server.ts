/** Local single-owner auth. No broker, hosted identity, bearer or dev fallback. */
import { betterAuth } from "better-auth";
import { getPglite, getSql } from "../db";
import { pgliteDialect } from "./pglite-dialect";
import { readLocalOwner, LOCAL_ORIGIN, OWNER_EMAIL } from "../../../scripts/local-owner.mjs";
import { assertLocalRequest } from "./local-request";

export const authConfigured = true;
export const SESSION_TOKEN_COOKIE = "prospector-owner.session_token";
let initialization: ReturnType<typeof initializeLocalAuth> | undefined;

async function initializeLocalAuth() {
  // This local launcher never opens a configured remote database.
  if (process.env.DATABASE_URL?.trim())
    throw new Error("Local operator requires DATABASE_URL to be unset.");
  const owner = readLocalOwner();
  const sql = await getSql();
  await sql.transaction(async (tx) => {
    const existing = await tx<{
      id: string;
      email: string;
    }>`select id, email from "user" where id = ${owner.id} or email = ${OWNER_EMAIL}`;
    if (existing.some((row) => row.id !== owner.id || row.email !== OWNER_EMAIL))
      throw new Error("Local owner identity conflict; restore matching configuration.");
    await tx`insert into "user" (id, name, email, "emailVerified") values (${owner.id}, 'Local owner', ${OWNER_EMAIL}, true) on conflict (id) do nothing`;
    const accounts = await tx<{
      id: string;
      password: string;
    }>`select id, password from account where "userId" = ${owner.id} and "providerId" = 'credential'`;
    if (accounts.length > 1) throw new Error("Ambiguous local owner credential.");
    if (!accounts.length) {
      await tx`insert into account (id, "accountId", "providerId", "userId", password, "updatedAt") values (${owner.id}, ${owner.id}, 'credential', ${owner.id}, ${owner.passwordHash}, now())`;
    } else if (accounts[0].password !== owner.passwordHash) {
      await tx`update account set password = ${owner.passwordHash}, "updatedAt" = now() where id = ${accounts[0].id}`;
      await tx`delete from session where "userId" = ${owner.id}`;
    }
  });
  return betterAuth({
    appName: "PROspector local",
    baseURL: LOCAL_ORIGIN,
    secret: owner.authSecret,
    database: { dialect: pgliteDialect(() => getPglite()), type: "postgres" },
    trustedOrigins: [LOCAL_ORIGIN],
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 16,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, window: 60, max: 100 },
    advanced: {
      // The supported launcher accepts only IPv4 loopback sockets, for one owner.
      // No proxy supplies trusted IP headers: all local callers share a per-path
      // throttle bucket. Keep tracking enabled so Better Auth enforces that bucket.
      ipAddress: { ipAddressHeaders: [] },
      useSecureCookies: false,
      defaultCookieAttributes: { httpOnly: true, sameSite: "strict", secure: false, path: "/" },
      cookies: { session_token: { name: SESSION_TOKEN_COOKIE } },
    },
  });
}

export function getLocalAuth() {
  initialization ??= initializeLocalAuth().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export async function handleLocalAuth(request: Request): Promise<Response> {
  const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };
  try {
    assertLocalRequest(request);
  } catch {
    return new Response("Forbidden", { status: 403, headers });
  }
  const path = new URL(request.url).pathname;
  const allowed =
    request.method === "GET"
      ? path === "/api/auth/get-session"
      : request.method === "POST" &&
        ["/api/auth/sign-in/email", "/api/auth/sign-out"].includes(path);
  if (!allowed) return new Response("Not found", { status: 404, headers });
  if (request.method === "POST") {
    if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json")
      return new Response("JSON required", { status: 415, headers });
    // Bound the body before Better Auth parses it; passwords never enter logs.
    const reader = request.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) {
          await reader.cancel();
          return new Response("Too large", { status: 413, headers });
        }
        chunks.push(value);
      }
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return new Response("Invalid JSON", { status: 400, headers });
    }
    if (path.endsWith("/sign-in/email") && body?.email !== OWNER_EMAIL)
      return new Response("Unauthorized", { status: 401, headers });
    request = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(body),
    });
  }
  const auth = await getLocalAuth();
  const response = await auth.handler(request);
  Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}
