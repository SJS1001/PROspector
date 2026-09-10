import { readLocalDemoComposition, validateLocalDemoComposition } from "../../../../domain/local-demo-composition";
import type { LocalDemoScenarioAdmission } from "../../../local-demo/_admission";

const SESSION = "prospector-local-scenario", CSRF = "prospector-local-scenario-csrf";

export async function handleLocalDemoScenario(admission: LocalDemoScenarioAdmission) {
  const composition = await readLocalDemoComposition();
  if (!await validateLocalDemoComposition(composition)) return response(404, "not_found");
  const result = Response.json({ composition, workspaceId: admission.workspaceId, revision: admission.revision, authority: admission.authority }, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  result.headers.append("set-cookie", `${SESSION}=${admission.sessionId}; Path=/; Max-Age=900; HttpOnly; SameSite=Strict`);
  result.headers.append("set-cookie", `${CSRF}=${admission.csrf}; Path=/; Max-Age=900; HttpOnly; SameSite=Strict`);
  return result;
}
function response(status: number, error: string) { return Response.json({ error }, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
