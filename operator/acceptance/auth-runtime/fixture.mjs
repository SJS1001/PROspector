import { createServer } from "vite";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { serializeSignedCookie } from "better-call";
import { createHash, randomUUID } from "node:crypto";
import { readLocalOwner } from "../../scripts/local-owner.mjs";
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
const db = await vite.ssrLoadModule("/src/lib/db.ts");
try {
  const sql = await db.getSql();
  const owner = readLocalOwner();
  if (process.argv[2] === "seed") {
    const vault = await vite.ssrLoadModule("/src/lib/server/vault.ts");
    const second = randomUUID(),
      token = randomUUID();
    await sql`insert into "user" (id,name,email,"emailVerified") values (${second},'Fictional second owner','second-owner@example.invalid',true)`;
    await sql`insert into session (id,token,"userId","expiresAt","updatedAt") values (${randomUUID()},${token},${second},${new Date(Date.now() + 3600000)},now())`;
    const signed = await serializeSignedCookie(
      "prospector-owner.session_token",
      token,
      owner.authSecret,
      { httpOnly: true, sameSite: "strict", path: "/" },
    );
    writeFileSync(join(process.env.OPERATOR_DATA_DIR, "second-cookie"), signed.split(";")[0], {
      mode: 0o600,
    });
    writeFileSync(join(process.env.OPERATOR_DATA_DIR, "second-id"), second, { mode: 0o600 });
    const expiredToken = randomUUID();
    await sql`insert into session (id,token,"userId","expiresAt","updatedAt") values (${randomUUID()},${expiredToken},${second},${new Date(Date.now() - 3600000)},now())`;
    const expired = await serializeSignedCookie(
      "prospector-owner.session_token",
      expiredToken,
      owner.authSecret,
      { httpOnly: true, sameSite: "strict", path: "/" },
    );
    writeFileSync(join(process.env.OPERATOR_DATA_DIR, "expired-cookie"), expired.split(";")[0], {
      mode: 0o600,
    });
    await sql`insert into workspaces (user_id,company_name,company_legal) values (${owner.id},'Fictional Quarry','Fictional Quarry')`;
    await sql`insert into operator_secrets (user_id,name,value) values (${owner.id},'llm_key',${vault.sealSecret("fictional-auth-runtime-provider-sentinel")})`;
  }
  const tables =
    await sql`select tablename from pg_tables where schemaname='public' order by tablename`;
  const rows = [];
  for (const { tablename } of tables) {
    // Authentication bookkeeping is intentionally separate from workspace state.
    if (["user", "account", "session", "verification"].includes(tablename)) continue;
    const data = await sql.query(`select * from "${tablename.replaceAll('"', '""')}"`);
    rows.push([tablename, data.map((row) => JSON.stringify(row)).sort()]);
  }
  console.log(
    "WORKSPACE_DIGEST=" + createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
  );
} finally {
  await db.closeDatabase();
  await vite.close();
}
