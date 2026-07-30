import { consumeCsrfToken, csrfTokenFromRequest, CsrfTokenError } from "./csrf";
import { admitPilotOwner, PilotAccessError } from "./pilot-access";
import { readBoundedJson, validateSameOriginMutation } from "./request-security";

export const PROSPECTING_MUTATION_INTENT = "prospecting-mutation";
export const MAX_PROSPECTING_BODY_BYTES = 8192;
export type ProspectingHandlerDependencies = { database: D1Database; subjectPepper: string; pilotOwnerEmail: string; getIdentity(): Promise<{ email: string; displayName: string } | null> };
export async function handleProspectingGet(request: Request, d: ProspectingHandlerDependencies) { void request; try { await owner(d); return Response.json({ readiness: null, runs: [], evidence: [], assessments: [], queue: [] }, { headers: headers() }); } catch { return unavailable(); } }
export async function handleProspectingPost(request: Request, d: ProspectingHandlerDependencies) {
  try { const principal = await owner(d); const rejected = validateSameOriginMutation(request, PROSPECTING_MUTATION_INTENT, MAX_PROSPECTING_BODY_BYTES); if (rejected) return json({ error: rejected.error }, rejected.status); await consumeCsrfToken(d.database, principal.subject, csrfTokenFromRequest(request)); const body = await readBoundedJson(request, MAX_PROSPECTING_BODY_BYTES); if (!body || typeof body.action !== "string" || !["create_candidate", "activate", "manual_find", "issue_assignment", "revoke_assignment", "review"].includes(body.action) || Object.keys(body).some(k => !["action", "idempotencyKey", "expectedRevision", "profileId", "candidateId", "assignmentId", "prospectId", "decision", "reason", "reviewAt"].includes(k))) return json({ error: "unsupported_action" }, 400); return json({ error: "capability_unavailable" }, 409); } catch (e) { if (e instanceof CsrfTokenError) return json({ error: e.code }, 403); if (e instanceof PilotAccessError) return unavailable(); if (e instanceof SyntaxError) return json({ error: "invalid_json" }, 400); return json({ error: "server_error" }, 500); }
}
/** Runner ingress deliberately has no browser session, projection, or generic callback. */
export async function handleRunnerIngress(request: Request) { void request; return json({ error: "runner_ingress_unavailable" }, 404); }
async function owner(d: ProspectingHandlerDependencies) { return admitPilotOwner(await d.getIdentity(), d.pilotOwnerEmail, d.subjectPepper); }
function headers() { return { "cache-control": "no-store", "x-content-type-options": "nosniff" }; } function json(v: unknown, s = 200) { return Response.json(v, { status: s, headers: headers() }); } function unavailable() { return json({ error: "private_workspace_unavailable" }, 404); }
