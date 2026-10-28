import { dbSource, getSql, type Sql } from "../db";
import type { ArchiveAdapter } from "./archive";

/** Use the migrated durable client and its pinned transaction connection. */
export const localArchiveAdapter: ArchiveAdapter = {
  async transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
    if (dbSource !== "pglite")
      throw new Error("Workspace archives are only available on the local database");
    const sql = await getSql();
    return sql.transaction(fn);
  },
};

/** Factory for server handlers; acquiring it does not open a connection. */
export async function getArchiveAdapter(): Promise<ArchiveAdapter> {
  if (dbSource !== "pglite")
    throw new Error("Workspace archives are only available on the local database");
  return localArchiveAdapter;
}
