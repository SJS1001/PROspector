import { env } from "cloudflare:workers";
import { createInMemoryRateLimiter, handlePublicUnsubscribePost, UNSUBSCRIBE_RETRY_MESSAGE } from "../../../domain/unsubscribe-handler";

/** Public unsubscribe. POST only: a GET never writes, so link scanners and
 * prefetchers cannot unsubscribe anyone. The limiter is in-memory and per
 * isolate (local control only). */
export const dynamic = "force-dynamic";
const limiter = createInMemoryRateLimiter({ limit: 10, windowMs: 60_000 });

export async function POST(request: Request) {
  const bindings = env as unknown as { DB?: D1Database };
  if (!bindings.DB) return Response.json({ message: UNSUBSCRIBE_RETRY_MESSAGE }, { status: 503, headers: { "cache-control": "no-store" } });
  return handlePublicUnsubscribePost(request, { database: bindings.DB, limiter });
}
