/**
 * Signed invite cookie (deployment source change S11): proof that this browser redeemed a valid
 * invite code. Same HMAC token format as the demo and participant cookies (src/server/auth/signed-token.ts),
 * with its own purpose, so no other token verifies as an invite.
 *
 * Pure (secret passed explicitly, WebCrypto only), so src/proxy.ts can verify it on every request
 * without a database round trip. The server-side check (./site-access.ts) additionally confirms
 * the code has not been revoked.
 */
import { z } from "zod";

import { INVITE_COOKIE } from "@/server/auth/cookie-names";
import { signToken, verifyToken } from "@/server/auth/signed-token";

export const INVITE_ACCESS_PURPOSE = "site-invite/v1";
/** 30 days: long enough for a study with a follow-up, short enough that a leaked cookie ages out. */
export const INVITE_ACCESS_TTL_SECONDS = 60 * 60 * 24 * 30;
export { INVITE_COOKIE };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inviteClaims = z
  .object({
    t: z.literal("invite"),
    /** invite_codes.id of the redeemed code. */
    iid: z.string().regex(UUID_RE),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();

export type InviteAccessClaims = { inviteId: string; issuedAt: number; expiresAt: number };

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function signInviteAccess(inviteId: string, secret: string, opts: { now?: number; ttlSeconds?: number } = {}): Promise<string> {
  const iat = opts.now ?? nowSeconds();
  return signToken(
    inviteClaims.parse({ t: "invite", iid: inviteId, iat, exp: iat + (opts.ttlSeconds ?? INVITE_ACCESS_TTL_SECONDS) }),
    secret,
    INVITE_ACCESS_PURPOSE,
  );
}

export async function verifyInviteAccess(
  token: string,
  secret: string,
  opts: { now?: number } = {},
): Promise<{ ok: true; claims: InviteAccessClaims } | { ok: false; reason: string }> {
  if (!secret) return { ok: false, reason: "no_secret" };
  const verified = await verifyToken(token, secret, INVITE_ACCESS_PURPOSE);
  if (!verified.ok) return verified;
  const parsed = inviteClaims.safeParse(verified.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_claims" };
  const now = opts.now ?? nowSeconds();
  if (parsed.data.exp <= now || parsed.data.iat > now + 60) return { ok: false, reason: "expired" };
  return { ok: true, claims: { inviteId: parsed.data.iid.toLowerCase(), issuedAt: parsed.data.iat, expiresAt: parsed.data.exp } };
}
