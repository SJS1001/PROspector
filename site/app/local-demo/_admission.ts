import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { admitPilotOwner } from "../../domain/pilot-access";
import { cloudflareAccessMode } from "../cloudflare-access";
import { isLoopbackHostname, runtimeIdentity } from "../runtime-identity";

type LocalDemoBindings = Readonly<{
  OWNER_SUBJECT_PEPPER?: string;
  PILOT_OWNER_EMAIL?: string;
  LOCAL_DEMO?: string;
  TRUSTED_IDENTITY_PROVIDER?: string;
  CLOUDFLARE_ACCESS_ISSUER?: unknown;
  CLOUDFLARE_ACCESS_AUDIENCE?: unknown;
}>;

export type LocalDemoScenarioAdmission = Readonly<{
  sessionId: string;
  csrf: string;
  workspaceId: "local-demo-workspace-v1";
  revision: number;
  authority: string;
}>;

const WORKSPACE = "local-demo-workspace-v1";
const SCENARIO = "local-demo-phase4-through-phase7-v1";
const MAX_REVISION = 4;
const SESSION = "prospector-local-scenario";
const CSRF = "prospector-local-scenario-csrf";
const sessions = new Map<string, { revision: number; csrfDigest: string; expiresAt: number }>();

const bindings = env as unknown as LocalDemoBindings;

function configuredForDisposableOwner() {
  return bindings.TRUSTED_IDENTITY_PROVIDER === "local-demo"
    && bindings.LOCAL_DEMO === "1"
    && cloudflareAccessMode({ issuer: bindings.CLOUDFLARE_ACCESS_ISSUER, audience: bindings.CLOUDFLARE_ACCESS_AUDIENCE }) === "disabled"
    && typeof bindings.PILOT_OWNER_EMAIL === "string"
    && typeof bindings.OWNER_SUBJECT_PEPPER === "string";
}

async function admitted(request?: Request) {
  if (!configuredForDisposableOwner()) return false;
  try {
    await admitPilotOwner(await runtimeIdentity(request, bindings), bindings.PILOT_OWNER_EMAIL!, bindings.OWNER_SUBJECT_PEPPER!);
    return true;
  } catch {
    return false;
  }
}

/** Complete, network-free page admission. Scenario modules load only after it. */
export async function admitLocalDemoPage() {
  const host = (await headers()).get("host");
  if (!host) return false;
  try {
    if (!isLoopbackHostname(new URL(`http://${host}`).hostname)) return false;
  } catch {
    return false;
  }
  return admitted();
}

/** Complete local-only admission. POST authority is consumed before the scenario module loads. */
export async function admitLocalDemoScenarioRequest(request: Request): Promise<LocalDemoScenarioAdmission | Response | null> {
  const contentLength = request.headers.get("content-length");
  if (
    !["GET", "POST"].includes(request.method)
    || new URL(request.url).search
    || (request.method === "POST" && request.headers.get("content-type") !== "application/json")
    || (request.method === "GET" && (request.headers.has("content-type") || (contentLength !== null && contentLength !== "0")))
  ) return null;
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    try { if (!origin || new URL(origin).origin !== new URL(request.url).origin) return null; }
    catch { return null; }
  }
  if (!await admitted(request)) return null;
  const pepper = bindings.OWNER_SUBJECT_PEPPER;
  if (!pepper) return null;
  if (request.method === "GET") {
    const prior = cookie(request, SESSION);
    const priorState = prior ? sessions.get(prior) : undefined;
    const now = Date.now();
    if (prior && priorState && priorState.expiresAt <= now) sessions.delete(prior);
    const sessionId = priorState && priorState.expiresAt > now ? prior : randomToken();
    return issueAdmission(sessionId, sessions.get(sessionId)?.revision ?? 0, pepper);
  }
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return error(409, "scenario_request_invalid"); }
  if (Object.keys(body).sort().join(",") !== "action,authority,expectedRevision,workspaceId" || body.action !== "advance" || body.workspaceId !== WORKSPACE || !Number.isInteger(body.expectedRevision)) return error(409, "scenario_request_invalid");
  const sessionId = cookie(request, SESSION), csrf = cookie(request, CSRF);
  // Hash before consulting authoritative state. Once state is read, compare and
  // reserve synchronously so two continuations cannot both consume one token.
  const presentedCsrfDigest = csrf ? await sha256(csrf) : "";
  const state = sessionId ? sessions.get(sessionId) : undefined;
  if (!sessionId || !csrf || !state || state.expiresAt <= Date.now() || state.csrfDigest !== presentedCsrfDigest) return error(403, "invalid_csrf_token");
  state.csrfDigest = "consumed";
  const authority = await verifyAuthority(String(body.authority ?? ""), pepper);
  if (!authority || authority.sessionId !== sessionId || authority.workspaceId !== WORKSPACE || authority.scenarioId !== SCENARIO || authority.revision !== body.expectedRevision || authority.revision !== state.revision || authority.expiresAt <= Date.now()) return error(409, "stale_scenario_authority");
  if (state.revision >= MAX_REVISION) return error(409, "scenario_complete");
  return issueAdmission(sessionId, state.revision + 1, pepper);
}

async function issueAdmission(sessionId: string, revision: number, pepper: string): Promise<LocalDemoScenarioAdmission> {
  const csrf = randomToken(), expiresAt = Date.now() + 15 * 60_000;
  sessions.set(sessionId, { revision, csrfDigest: await sha256(csrf), expiresAt });
  return { sessionId, csrf, workspaceId: WORKSPACE, revision, authority: await signAuthority({ workspaceId: WORKSPACE, scenarioId: SCENARIO, revision, sessionId, expiresAt }, pepper) };
}

async function signAuthority(payload: Record<string, unknown>, pepper: string) { const encoded = base64url(JSON.stringify(payload)); return `${encoded}.${await hmac(encoded, pepper)}`; }
async function verifyAuthority(value: string, pepper: string) { const [encoded, signature, extra] = value.split("."); if (!encoded || !signature || extra || !timingSafe(signature, await hmac(encoded, pepper))) return null; try { return JSON.parse(new TextDecoder().decode(decode64(encoded))); } catch { return null; } }
async function hmac(value: string, pepper: string) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)))); }
async function sha256(value: string) { return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))); }
function decode64(value: string) { const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "="); return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)); }
function base64url(value: string | Uint8Array) { const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value; let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, ""); }
function randomToken() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return base64url(bytes); }
function cookie(request: Request, name: string) { return (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? ""; }
function timingSafe(left: string, right: string) { if (left.length !== right.length) return false; let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index); return difference === 0; }
function error(status: number, code: string) { return Response.json({ error: code }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
