import type { Pool, PoolClient } from "pg";

export async function inTransaction<T>(pool: Pool | PoolClient, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (typeof (pool as Pool).totalCount !== "number") return fn(pool as PoolClient);
  const client = await (pool as Pool).connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
