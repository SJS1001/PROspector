import { env } from "cloudflare:workers";
import { admitPilotOwner } from "../../../../domain/pilot-access";
import { isLocalDemoRequest, runtimeIdentity } from "../../../runtime-identity";

type PreviewBindings = Readonly<{ OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; LOCAL_DEMO?: string; TRUSTED_IDENTITY_PROVIDER?: string; CLOUDFLARE_ACCESS_ISSUER?: unknown; CLOUDFLARE_ACCESS_AUDIENCE?: unknown }>;

/** Legacy preview URL retained as metadata-only evidence. No codec, row value,
 * text, bytes, digest, encoding, file, or export materialization is reachable. */
export async function handleCrmHandoffPreview(request: Request) {
  const bindings = env as unknown as PreviewBindings;
  if (!isLocalDemoRequest(request, bindings) || !sameOrigin(request) || !bindings.PILOT_OWNER_EMAIL || !bindings.OWNER_SUBJECT_PEPPER) return notFound();
  try {
    await admitPilotOwner(await runtimeIdentity(request, bindings), bindings.PILOT_OWNER_EMAIL, bindings.OWNER_SUBJECT_PEPPER);
  } catch {
    return notFound();
  }
  return Response.json({
    kind: "crm_handoff_local_demo_precondition",
    fictional: true,
    decision: { admitted: [], admittedRowCount: 0, refusedCount: 2, reason: "crm_export_recheck_blocked" },
    preview: { metadataOnly: true, fieldCount: 7, schemaContract: "crm-handoff-fields/v1", materializationAuthorized: false },
    exportAuthorized: false,
    deliveryAuthorized: false,
    downloadAuthorized: false,
    persistenceAuthorized: false,
    providerInvocationAuthorized: false,
  }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
