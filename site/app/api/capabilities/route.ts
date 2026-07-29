import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { sql } from "drizzle-orm";

export async function GET() {
  const user = await getChatGPTUser();
  const bindings = env as unknown as { DB?: D1Database; FILES?: R2Bucket };
  let database = false;
  try { if (bindings.DB) { await getDb().run(sql`SELECT 1 AS ok`); database = true; } } catch { database = false; }
  return Response.json({
    ok: true,
    identity: user ? { authenticated: true, email: user.email } : { authenticated: false },
    capabilities: { d1: database, r2: Boolean(bindings.FILES), privateIdentityHeaders: Boolean(user), gmail: "requires-controlled-account-proof", scheduler: "requires-hosted-proof" },
  }, { headers: { "cache-control": "no-store" } });
}
