/**
 * Playwright global setup: admits the test browser through the always-on invite gate (S11).
 *
 * The site has no open mode, so every spec starts from a storage state that already holds a valid
 * invite cookie. One demo-labelled code is created in the development database (DATABASE_URL)
 * per run, by the first staff account, with a one-day redemption window; its cookie is signed
 * with BETTER_AUTH_SECRET from .env, exactly as /invite/redeem would sign it. Both cookie names
 * are written: the plain one (`next dev`) and the `__Host-` one (`next start`, NODE_ENV=production;
 * Chromium accepts Secure cookies on http://localhost).
 *
 * Specs that test the gate itself start a context with `storageState: { cookies: [], origins: [] }`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { FullConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import { signInviteAccess } from "../../src/server/access/invite-cookie";
import { generateInviteCode, hashInviteCode, inviteCodeHint, normaliseInviteCode } from "../../src/server/access/invite-code";

export const INVITE_STORAGE_STATE = "test-results/.auth/invite.json";

export default async function globalSetup(config: FullConfig): Promise<void> {
  loadEnv({ quiet: true });
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || !process.env.DATABASE_URL) throw new Error("e2e global setup: DATABASE_URL and BETTER_AUTH_SECRET must be set (.env)");
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let inviteId: string;
  try {
    const owner = await pool.query<{ id: string }>("SELECT id FROM users ORDER BY created_at LIMIT 1");
    if (!owner.rows[0]) throw new Error("e2e global setup: no staff account exists; run npm run dev:bootstrap first");
    const code = normaliseInviteCode(generateInviteCode())!;
    const r = await pool.query<{ id: string }>(
      `INSERT INTO invite_codes (label, code_hash, code_hint, expires_at, created_by)
       VALUES ('Demo: e2e test browser', $1, $2, now() + interval '1 day', $3) RETURNING id`,
      [hashInviteCode(code), inviteCodeHint(code), owner.rows[0].id],
    );
    inviteId = r.rows[0]!.id;
  } finally {
    await pool.end();
  }

  const token = await signInviteAccess(inviteId, secret);
  const { hostname } = new URL(baseURL);
  const cookie = (name: string, secure: boolean) => ({ name, value: token, domain: hostname, path: "/", expires: -1, httpOnly: true, secure, sameSite: "Lax" as const });
  mkdirSync(dirname(INVITE_STORAGE_STATE), { recursive: true });
  writeFileSync(INVITE_STORAGE_STATE, JSON.stringify({ cookies: [cookie("ie_invite", false), cookie("__Host-ie_invite", true)], origins: [] }, null, 2));
}
