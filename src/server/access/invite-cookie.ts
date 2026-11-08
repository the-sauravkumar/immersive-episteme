import { z } from "zod";

import { INVITE_COOKIE } from "@/server/auth/cookie-names";
import { signToken, verifyToken } from "@/server/auth/signed-token";

const INVITE_ACCESS_PURPOSE = "site-invite/v1";
export const INVITE_ACCESS_TTL_SECONDS = 60 * 60 * 24 * 30;
export { INVITE_COOKIE };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inviteClaims = z
  .object({
    t: z.literal("invite"),
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
