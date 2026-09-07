import { env } from "cloudflare:workers";
import { runtimeIdentity } from "../../../runtime-identity";
import { admitPilotOwner } from "../../../../domain/pilot-access";
import { personDiscoveryC4Enabled, seedPersonDiscoveryC4 } from "../../../../domain/person-discovery-c4-acceptance";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const bindings = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; LOCAL_DEMO?: string; TRUSTED_IDENTITY_PROVIDER?: string; PROSPECTOR_PERSON_DISCOVERY_C4?: string };
  if (!bindings.DB || !bindings.OWNER_SUBJECT_PEPPER || !bindings.PILOT_OWNER_EMAIL || !personDiscoveryC4Enabled(request, bindings)) return Response.json({ error: "not_found" }, { status: 404 });
  try {
    await admitPilotOwner(await runtimeIdentity(request, bindings), bindings.PILOT_OWNER_EMAIL, bindings.OWNER_SUBJECT_PEPPER);
  } catch {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  try {
    return Response.json(await seedPersonDiscoveryC4(bindings.DB, bindings.PILOT_OWNER_EMAIL, bindings.OWNER_SUBJECT_PEPPER), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "synthetic_seed_failed" }, { status: 500 });
  }
}
