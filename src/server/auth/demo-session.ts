/**
 * Public demo cookie: lets a visitor explore both learning conditions WITHOUT being in a study.
 * Always non-experimental (`x: false`): telemetry from a demo must be tagged non-experimental
 * and demo access only ever serves demo/published-public content, never a study's dataset.
 * Set from /explore (see ./actions.ts).
 *
 * Pure (secret passed explicitly, no request APIs), like ./participant-session-token.ts.
 */
import { z } from "zod";

import { DEMO_COOKIE } from "./cookie-names";
import { signToken, verifyToken } from "./signed-token";

export const DEMO_SESSION_PURPOSE = "public-demo/v1";
export const DEMO_SESSION_TTL_SECONDS = 60 * 60 * 4;
export { DEMO_COOKIE };

const demoClaims = z
  .object({
    t: z.literal("demo"),
    /** experimental flag: always false for demo sessions. */
    x: z.literal(false),
    /** random id to correlate non-experimental telemetry. */
    did: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();

export type DemoSessionClaims = { demoId: string; experimental: false; issuedAt: number; expiresAt: number };

const nowSeconds = () => Math.floor(Date.now() / 1000);

export async function signDemoSession(
  secret: string,
  opts: { now?: number; ttlSeconds?: number; demoId?: string } = {},
): Promise<string> {
  const iat = opts.now ?? nowSeconds();
  const did = opts.demoId ?? crypto.randomUUID().replaceAll("-", "");
  return signToken(
    demoClaims.parse({ t: "demo", x: false, did, iat, exp: iat + (opts.ttlSeconds ?? DEMO_SESSION_TTL_SECONDS) }),
    secret,
    DEMO_SESSION_PURPOSE,
  );
}

export async function verifyDemoSession(
  token: string,
  secret: string,
  opts: { now?: number } = {},
): Promise<{ ok: true; claims: DemoSessionClaims } | { ok: false; reason: string }> {
  const verified = await verifyToken(token, secret, DEMO_SESSION_PURPOSE);
  if (!verified.ok) return verified;
  const parsed = demoClaims.safeParse(verified.payload);
  if (!parsed.success) return { ok: false, reason: "invalid_claims" };
  const now = opts.now ?? nowSeconds();
  if (parsed.data.exp <= now || parsed.data.iat > now + 60) return { ok: false, reason: "expired" };
  return {
    ok: true,
    claims: { demoId: parsed.data.did, experimental: false, issuedAt: parsed.data.iat, expiresAt: parsed.data.exp },
  };
}
