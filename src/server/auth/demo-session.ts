import { z } from "zod";

import { LEARNING_CONDITIONS, type LearningCondition } from "@/lib/permissions/learning";

import { signToken, verifyToken } from "./signed-token";

const DEMO_SESSION_PURPOSE = "public-demo/v2";
export const DEMO_SESSION_TTL_SECONDS = 60 * 60 * 4;

const demoClaims = z
  .object({
    t: z.literal("demo"),
    x: z.literal(false),
    did: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    c: z.enum(LEARNING_CONDITIONS),
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
  })
  .strict();

export type DemoSessionClaims = { demoId: string; condition: LearningCondition; experimental: false; issuedAt: number; expiresAt: number };

const nowSeconds = () => Math.floor(Date.now() / 1000);

export function drawDemoCondition(): LearningCondition {
  return LEARNING_CONDITIONS[crypto.getRandomValues(new Uint8Array(1))[0]! % LEARNING_CONDITIONS.length]!;
}

export async function signDemoSession(
  secret: string,
  condition: LearningCondition,
  opts: { now?: number; ttlSeconds?: number; demoId?: string } = {},
): Promise<string> {
  const iat = opts.now ?? nowSeconds();
  const did = opts.demoId ?? crypto.randomUUID().replaceAll("-", "");
  return signToken(
    demoClaims.parse({ t: "demo", x: false, did, c: condition, iat, exp: iat + (opts.ttlSeconds ?? DEMO_SESSION_TTL_SECONDS) }),
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
    claims: { demoId: parsed.data.did, condition: parsed.data.c, experimental: false, issuedAt: parsed.data.iat, expiresAt: parsed.data.exp },
  };
}
