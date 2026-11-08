import { z } from "zod";

const postgresUrl = z
  .url({ protocol: /^postgres(ql)?$/, error: "must be a postgres:// or postgresql:// URL" })
  .describe("PostgreSQL connection string");

export const PLACEHOLDER_SECRET_MARKERS = [
  "replace-with",
  "not-a-secret",
  "ci-only",
  "changeme",
  "change-me",
  "placeholder",
  "your-secret",
  "example",
] as const;

export const MIN_PRODUCTION_SECRET_LENGTH = 43;
export const MIN_PRODUCTION_SECRET_DISTINCT_CHARS = 16;

const SECRET_HINT = "generate one with the command in .env.example";

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const ipOrCidr = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]*:[0-9a-fA-F:.]*)(?:\/\d{1,3})?$/;

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: postgresUrl,
    DATABASE_URL_UNPOOLED: postgresUrl.optional(),
    DATABASE_CA_PEM: z
      .string()
      .optional()
      .transform((v) => (v && v.trim() ? v.replace(/\\n/g, "\n").trim() : undefined))
      .refine((v) => v === undefined || /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(v), "must be a PEM certificate bundle"),
    TEST_DATABASE_URL: postgresUrl.optional(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "must be at least 32 characters")
      .refine(
        (s) => !PLACEHOLDER_SECRET_MARKERS.some((m) => s.toLowerCase().includes(m)),
        `is a documented placeholder value; ${SECRET_HINT}`,
      ),
    BETTER_AUTH_URL: z.url(),
    APP_BUILD_VERSION: z.string().min(1).default("dev"),
    DB_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
    AUTH_TRUSTED_PROXIES: z
      .string()
      .optional()
      .transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean))
      .refine((list) => list.every((e) => ipOrCidr.test(e)), "must be comma-separated IP addresses or CIDR ranges"),
    AUTH_CLIENT_IP_HEADER: z
      .string()
      .regex(/^[A-Za-z0-9-]{1,64}$/, "must be an HTTP header name")
      .transform((v) => v.toLowerCase())
      .optional(),
    PUBLIC_DEMO: z.enum(["auto", "on", "off"]).default("auto"),
    GOOGLE_CLIENT_ID: optionalText.pipe(z.string().regex(/^[A-Za-z0-9._-]{8,200}$/, "must be a Google OAuth client ID").optional()),
    GOOGLE_CLIENT_SECRET: optionalText.pipe(z.string().min(8, "must be the Google OAuth client secret").max(200).optional()),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: [env.GOOGLE_CLIENT_ID ? "GOOGLE_CLIENT_SECRET" : "GOOGLE_CLIENT_ID"],
        message: "is required when the other Google OAuth variable is set (set both or neither)",
      });
    }
    if (env.NODE_ENV !== "production") return;
    if (isPooledHost(env.DATABASE_URL) && !env.DATABASE_URL_UNPOOLED) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL_UNPOOLED"],
        message: "is required in production when DATABASE_URL is a pooled (-pooler) host: LISTEN/NOTIFY needs a direct connection (see docs/deploy/RUNBOOK.md)",
      });
    }
    if (env.DATABASE_URL_UNPOOLED && isPooledHost(env.DATABASE_URL_UNPOOLED)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL_UNPOOLED"],
        message: "points at a pooled (-pooler) host; use the direct connection string",
      });
    }
    if (!env.DATABASE_CA_PEM && isRdsHost(env.DATABASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_CA_PEM"],
        message: "is required in production for an RDS database (the ap-south-1 CA bundle; see docs/deploy/RUNBOOK.md)",
      });
    }
    const s = env.BETTER_AUTH_SECRET;
    if (s.length < MIN_PRODUCTION_SECRET_LENGTH || new Set(s).size < MIN_PRODUCTION_SECRET_DISTINCT_CHARS) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: `is too weak for production (needs >= ${MIN_PRODUCTION_SECRET_LENGTH} random characters); ${SECRET_HINT}`,
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function isRdsHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith(".rds.amazonaws.com");
  } catch {
    return false;
  }
}

export function isPooledHost(url: string): boolean {
  try {
    return /-pooler\./.test(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function directDatabaseUrl(env: Pick<ServerEnv, "DATABASE_URL" | "DATABASE_URL_UNPOOLED">): string {
  return env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
}

export function withBuildVersion(source: Record<string, string | undefined>): Record<string, string | undefined> {
  if (source.APP_BUILD_VERSION?.trim()) return source;
  const sha = source.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase();
  if (sha && /^[0-9a-f]{7,40}$/.test(sha)) return { ...source, APP_BUILD_VERSION: sha.slice(0, 7) };
  return source.APP_BUILD_VERSION === "" ? { ...source, APP_BUILD_VERSION: undefined } : source;
}

export type GoogleOAuthCredentials = { clientId: string; clientSecret: string };

export function googleOAuthCredentials(env: Pick<ServerEnv, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET">): GoogleOAuthCredentials | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

let cached: ServerEnv | undefined;

export function parseServerEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(withBuildVersion(source));
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${issues}\nSee .env.example.`);
  }
  return result.data;
}

export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

export function resetServerEnvCache(): void {
  cached = undefined;
}
