import { dbSource, getPglite, type Sql } from "../db";
import type { ArchiveAdapter } from "./archive";

/** Local archive operations use one PGlite transaction. Hosted databases are
 * deliberately unsupported until a pinned-connection adapter is configured. */
export const localArchiveAdapter: ArchiveAdapter = {
  async transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
    if (dbSource !== "pglite")
      throw new Error("Workspace archives are only available on the local database");
    const pg = await getPglite();
    return pg.transaction(async (tx) => {
      const query = async <R = Record<string, unknown>>(
        text: string,
        params: unknown[] = [],
      ): Promise<R[]> => (await tx.query<R>(text, params)).rows;
      const sql = (async <R = Record<string, unknown>>(
        parts: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<R[]> => {
        let text = parts[0];
        for (let i = 0; i < values.length; i++) text += `$${i + 1}${parts[i + 1]}`;
        return query<R>(text, values);
      }) as Sql;
      sql.query = query;
      return fn(sql);
    });
  },
};

/** Factory for server handlers; acquiring it does not open a connection. */
export async function getArchiveAdapter(): Promise<ArchiveAdapter> {
  if (dbSource !== "pglite")
    throw new Error("Workspace archives are only available on the local database");
  return localArchiveAdapter;
}
