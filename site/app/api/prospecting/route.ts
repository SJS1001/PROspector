import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { handleProspectingGet, handleProspectingPost, type ProspectingHandlerDependencies } from "../../../domain/prospecting-handler";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return handleProspectingGet(request, dependencies()); }
export async function POST(request: Request) { return handleProspectingPost(request, dependencies()); }
function dependencies(): ProspectingHandlerDependencies { const b = env as unknown as { DB?: D1Database; OWNER_SUBJECT_PEPPER?: string; PILOT_OWNER_EMAIL?: string }; if (!b.DB || !b.OWNER_SUBJECT_PEPPER || !b.PILOT_OWNER_EMAIL) throw new Error("Secure prospecting bindings are unavailable"); return { database: b.DB, subjectPepper: b.OWNER_SUBJECT_PEPPER, pilotOwnerEmail: b.PILOT_OWNER_EMAIL, getIdentity: async () => { const u = await getChatGPTUser(); return u ? { email: u.email, displayName: u.displayName } : null; } }; }
