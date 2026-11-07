import "server-only";

import { getPool } from "@/server/db/client";

export async function hasPasswordSignIn(userId: string): Promise<boolean> {
  const r = await getPool().query("SELECT 1 FROM auth_accounts WHERE user_id = $1 AND provider_id = 'credential' AND password IS NOT NULL", [userId]);
  return (r.rowCount ?? 0) > 0;
}
