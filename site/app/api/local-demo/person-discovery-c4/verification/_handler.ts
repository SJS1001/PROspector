import { env } from "cloudflare:workers";
import { consumeCsrfToken, csrfCookieName, csrfTokenFromRequest, CsrfTokenError } from "../../../../../domain/csrf";
import { admitPilotOwner } from "../../../../../domain/pilot-access";
import { personDiscoveryC4Enabled } from "../../../../../domain/person-discovery-c4-acceptance";
import { consumePersonDiscoveryC4VerificationIntent } from "../../../../../domain/person-discovery-c4-verification";
import { readBoundedJson, validateSameOriginMutation } from "../../../../../domain/request-security";
import { runtimeIdentity } from "../../../../runtime-identity";

const INTENT = "person-discovery-c4-verification";

export async function handleLocalDemoVerification(request: Request) {
  const bindings = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; LOCAL_DEMO?: string; TRUSTED_IDENTITY_PROVIDER?: string; PROSPECTOR_PERSON_DISCOVERY_C4?: string };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL || !personDiscoveryC4Enabled(request, bindings)) return notFound();
  const rejected = validateSameOriginMutation(request, INTENT, 1024);
  if (rejected) return notFound();
  try {
    const principal = await admitPilotOwner(await runtimeIdentity(request, bindings), bindings.PILOT_OWNER_EMAIL, bindings.OWNER_SUBJECT_PEPPER);
    await consumeCsrfToken(bindings.DB, principal.subject, csrfTokenFromRequest(request, csrfCookieName("local-demo")));
    const body = await readBoundedJson(request, 1024);
    if (!validCommand(body)) return Response.json({ error: "invalid_command" }, { status: 400 });
    const workspace = await bindings.DB.prepare("SELECT id,owner_subject FROM workspaces WHERE owner_subject IN (?,?) ORDER BY CASE owner_subject WHEN ? THEN 0 ELSE 1 END LIMIT 1")
      .bind(principal.subject, principal.legacySubject ?? principal.subject, principal.subject).first<{ id: string; owner_subject: string }>();
    if (!workspace) return notFound();
    const result = await consumePersonDiscoveryC4VerificationIntent(request, bindings, bindings.DB, { workspaceId: workspace.id, principalSubject: workspace.owner_subject }, body);
    return Response.json(result.kind === "verified" ? { verification: result } : { error: result.reason }, { status: result.kind === "verified" ? 200 : 409, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  } catch (error) {
    if (error instanceof CsrfTokenError) return Response.json({ error: error.code }, { status: 403 });
    return notFound();
  }
}

function validCommand(value: unknown): value is { relevanceId: string; channel: "email" | "phone" } {
  return !!value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join(",") === "channel,relevanceId"
    && typeof (value as { relevanceId?: unknown }).relevanceId === "string"
    && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/u.test((value as { relevanceId: string }).relevanceId)
    && ((value as { channel?: unknown }).channel === "email" || (value as { channel?: unknown }).channel === "phone");
}
function notFound() { return Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } }); }
