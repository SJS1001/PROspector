import { env } from "cloudflare:workers";
import { handleRunnerIngress } from "../../../../domain/prospecting-handler";

/** The deployed callback is deliberately unavailable until a later hosted
 * capability checkpoint installs an explicit adapter and secret binding. */
export async function POST(request: Request) {
  const bindings = env as unknown as { DB?: D1Database };
  return handleRunnerIngress(request, bindings.DB ? { database: bindings.DB, runnerIngressEnabled: false } : undefined);
}
