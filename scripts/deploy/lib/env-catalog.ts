/**
 * The production environment catalogue shared by the deploy kit (preflight.ts, push-env.ps1 via
 * env-json.ts, and the comments in .env.production.example). One place says which variables the
 * app reads in production, which are secrets, and which must never be set on Vercel.
 *
 * Sources of truth this mirrors (read-only here; another workflow owns them):
 *   src/lib/env.ts (serverEnvSchema), src/server/cms/media/storage.ts (mediaEnvSchema),
 *   src/lib/client-ip.ts, src/lib/security/csp.ts. Facts about Vercel are quoted in
 *   docs/deploy/RESEARCH.md (section numbers below).
 */
import { readFileSync } from "node:fs";

import { parse } from "dotenv";

export type VarKind = "secret" | "config";

export interface CatalogEntry {
  name: string;
  kind: VarKind;
  /** required: preflight fails without it in production. */
  need: "required" | "conditional" | "optional";
  /** One line: where the value comes from. */
  source: string;
}

/** Variables pushed to Vercel Production. Order = push order. */
export const CATALOG: readonly CatalogEntry[] = [
  { name: "DATABASE_URL", kind: "secret", need: "required", source: "Neon POOLED string (host ep-...-pooler.ap-southeast-1.aws.neon.tech) for role episteme_app, ?sslmode=verify-full (RUNBOOK step 1)" },
  { name: "DATABASE_URL_UNPOOLED", kind: "secret", need: "conditional", source: "Neon DIRECT string (same host without -pooler), same role; dashboard LISTEN + migrations. Required when DATABASE_URL is pooled" },
  { name: "DATABASE_CA_PEM", kind: "config", need: "conditional", source: "RDS only (ap-south-1 CA bundle). Leave unset on Neon: its ISRG Root X1 chain is in Node's default store" },
  { name: "DB_POOL_MAX", kind: "config", need: "required", source: "3 (RESEARCH.md section 6)" },
  { name: "BETTER_AUTH_SECRET", kind: "secret", need: "required", source: "new 32 random bytes, base64url; never the local one" },
  { name: "BETTER_AUTH_URL", kind: "config", need: "required", source: "https://<production domain> (origin only)" },
  { name: "APP_BUILD_VERSION", kind: "config", need: "required", source: "git short SHA of the commit being deployed" },
  { name: "AUTH_CLIENT_IP_HEADER", kind: "config", need: "required", source: "x-forwarded-for (Vercel overwrites it; RESEARCH.md section 11)" },
  { name: "PUBLIC_DEMO", kind: "config", need: "optional", source: "auto (default)" },
  { name: "MEDIA_S3_BUCKET", kind: "config", need: "required", source: "Cloudflare R2 bucket name, private (RUNBOOK step 2); or the AWS S3 bucket" },
  { name: "MEDIA_S3_REGION", kind: "config", need: "required", source: "auto for R2; ap-south-1 for AWS S3" },
  { name: "MEDIA_S3_ENDPOINT", kind: "config", need: "conditional", source: "R2 only: https://<account-id>.r2.cloudflarestorage.com (unset for AWS S3)" },
  { name: "MEDIA_S3_FORCE_PATH_STYLE", kind: "config", need: "conditional", source: "R2 only: true" },
  { name: "MEDIA_S3_ACCESS_KEY_ID", kind: "secret", need: "required", source: "R2 API token (Object Read & Write, this bucket only): Access Key ID; or the AWS IAM user's key" },
  { name: "MEDIA_S3_SECRET_ACCESS_KEY", kind: "secret", need: "required", source: "the same token's Secret Access Key" },
  { name: "AWS_ROLE_ARN", kind: "config", need: "conditional", source: "only after source change S5 (OIDC, Option A)" },
  { name: "AWS_REGION", kind: "config", need: "conditional", source: "ap-south-1, only together with AWS_ROLE_ARN" },
] as const;

/**
 * Never set on Vercel. Reason shown by preflight and push-env.
 * NODE_ENV: Next assigns "production" for every command except `next dev`
 * (node_modules/next/dist/docs/01-app/02-guides/environment-variables.md).
 */
export const FORBIDDEN: Readonly<Record<string, string>> = {
  NODE_ENV: "Next.js sets it (production for build/start); do not override",
  TEST_DATABASE_URL: "test database only; never in production",
  AUTH_TRUSTED_PROXIES: "leave unset on Vercel; AUTH_CLIENT_IP_HEADER=x-forwarded-for instead (RESEARCH.md section 11)",
  MEDIA_LOCAL_DIR: "Vercel has no persistent disk; media must go to the S3-compatible store (R2)",
  AWS_ACCESS_KEY_ID: "Vercel reserves AWS_* keys; its values 'are not usable as AWS credentials' (RESEARCH.md section 9). Use MEDIA_S3_*",
  AWS_SECRET_ACCESS_KEY: "see AWS_ACCESS_KEY_ID",
  AWS_SESSION_TOKEN: "see AWS_ACCESS_KEY_ID",
  ADMIN_PASSWORD: "used only locally by scripts/create-admin.ts",
};

export const SECRET_NAMES = new Set(CATALOG.filter((e) => e.kind === "secret").map((e) => e.name));

export function catalogEntry(name: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.name === name);
}

export function isVercelSystemName(name: string): boolean {
  return name === "VERCEL" || name.startsWith("VERCEL_");
}

/** Reads and parses a dotenv file (same parser the repo's scripts use). Blank values are dropped. */
export function readEnvFile(path: string): Record<string, string> {
  const parsed = parse(readFileSync(path));
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v.trim() !== ""));
}

/** Total bytes of NAME=value pairs, for Vercel's 64 KB per-deployment limit (RESEARCH.md section 5). */
export function envBytes(env: Record<string, string>): number {
  return Object.entries(env).reduce((n, [k, v]) => n + Buffer.byteLength(k) + Buffer.byteLength(v), 0);
}

export const VERCEL_ENV_LIMIT_BYTES = 64 * 1024;

/** Password-free form of a connection string, for logs. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<unparseable url>";
  }
}
