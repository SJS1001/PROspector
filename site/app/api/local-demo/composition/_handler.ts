import { env } from "cloudflare:workers";
import { admitPilotOwner } from "../../../../domain/pilot-access";
import { readLocalDemoComposition } from "../../../../domain/local-demo-composition";
import { isLocalDemoRequest, runtimeIdentity } from "../../../runtime-identity";

type Bindings = Readonly<{
  OWNER_SUBJECT_PEPPER?: string;
  PILOT_OWNER_EMAIL?: string;
  LOCAL_DEMO?: string;
  TRUSTED_IDENTITY_PROVIDER?: string;
  CLOUDFLARE_ACCESS_ISSUER?: unknown;
  CLOUDFLARE_ACCESS_AUDIENCE?: unknown;
}>;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** A read-only response: no request body is parsed and no storage is bound. */
export async function handleLocalDemoComposition(request: Request) {
  const bindings = env as unknown as Bindings;
  if (!isLocalDemoRequest(request, bindings)) return notFound();
  if (!sameOrigin(request)) return notFound();
  if (!bindings.PILOT_OWNER_EMAIL || !bindings.OWNER_SUBJECT_PEPPER) return notFound();
  try {
    await admitPilotOwner(
      await runtimeIdentity(request, bindings),
      bindings.PILOT_OWNER_EMAIL,
      bindings.OWNER_SUBJECT_PEPPER,
    );
  } catch {
    return notFound();
  }
  return Response.json(readLocalDemoComposition(), {
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
}
