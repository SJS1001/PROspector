import { env } from "cloudflare:workers";
import { handleRunnerRuntimeRequest, type RunnerRuntimeBindings } from "../../../../domain/runner-runtime";

/** Default-off: only the explicit ingress switch plus a strong secret binding
 * composes this callback. Assignment issuance remains a separate switch. */
export async function POST(request: Request) {
  return handleRunnerRuntimeRequest(request, env as unknown as RunnerRuntimeBindings);
}
