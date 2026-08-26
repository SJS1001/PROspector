import { env } from "cloudflare:workers";
import { runtimeIdentity } from "../../runtime-identity";
import { handleProspectingGet, handleProspectingPost, type ProspectingHandlerDependencies } from "../../../domain/prospecting-handler";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleProspectingGet(request, dependencies(request)); }
export async function POST(request: Request) { return handleProspectingPost(request, dependencies(request)); }
function dependencies(request: Request): ProspectingHandlerDependencies { const b = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string; LOCAL_DEMO?: string }; if (!b.DB || !b.OWNER_SUBJECT_PEPPER || !b.PILOT_OWNER_EMAIL) throw new Error("Secure prospecting bindings are unavailable"); return { database: b.DB, subjectPepper: b.OWNER_SUBJECT_PEPPER, pilotOwnerEmail: b.PILOT_OWNER_EMAIL, getIdentity: async () => runtimeIdentity(request, b.LOCAL_DEMO) }; }
