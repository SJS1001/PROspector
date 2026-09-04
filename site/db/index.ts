import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Bind the selected greenfield target's D1 database as `DB` before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
