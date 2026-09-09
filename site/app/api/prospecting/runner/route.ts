import { env } from "cloudflare:workers";
import { handleRunnerIngress } from "../../../../domain/prospecting-handler";
import { composeRunnerIngress, type RunnerRuntimeBindings } from "../../../../domain/runner-runtime";

/** Default-off: only the explicit ingress switch plus a strong secret binding
 * composes this callback. Assignment issuance remains a separate switch. */
export async function POST(request: Request) {
  return handleRunnerIngress(request, composeRunnerIngress(env as unknown as RunnerRuntimeBindings));
}
