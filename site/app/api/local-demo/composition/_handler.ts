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

export type LocalDemoCompositionDependencies = Readonly<{
  bindings: Bindings;
  isLocalDemoRequest: typeof isLocalDemoRequest;
  runtimeIdentity: typeof runtimeIdentity;
  admitPilotOwner: typeof admitPilotOwner;
  readLocalDemoComposition: typeof readLocalDemoComposition;
}>;

const productionDependencies: LocalDemoCompositionDependencies = {
  bindings: env as unknown as Bindings,
  isLocalDemoRequest,
  runtimeIdentity,
  admitPilotOwner,
  readLocalDemoComposition,
};

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
export async function handleLocalDemoComposition(
  request: Request,
  dependencies: LocalDemoCompositionDependencies = productionDependencies,
) {
  const { bindings } = dependencies;
  if (!dependencies.isLocalDemoRequest(request, bindings)) return notFound();
  if (!sameOrigin(request)) return notFound();
  if (!bindings.PILOT_OWNER_EMAIL || !bindings.OWNER_SUBJECT_PEPPER) return notFound();
  try {
    await dependencies.admitPilotOwner(
      await dependencies.runtimeIdentity(request, bindings),
      bindings.PILOT_OWNER_EMAIL,
      bindings.OWNER_SUBJECT_PEPPER,
    );
  } catch {
    return notFound();
  }
  return Response.json(dependencies.readLocalDemoComposition(), {
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
}
