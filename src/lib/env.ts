/**
 * Zod-validated server environment.
 *
 * Validation is lazy (first call to `serverEnv()`), so importing this module never breaks
 * `next build` for routes that do not touch the database. Do not import from client
 * components: these values are server secrets. (Not marked `server-only` because the
 * tsx-run scripts in scripts/ also use it.)
 */
import { z } from "zod";

const postgresUrl = z
  .url({ protocol: /^postgres(ql)?$/, error: "must be a postgres:// or postgresql:// URL" })
  .describe("PostgreSQL connection string");

/**
 * Markers of the documented placeholder values (.env.example, CI, tutorials). A secret that
 * contains one is publicly known: it would let anyone mint demo cookies and forge the HMAC on
 * participant cookies and Better Auth sessions (src/server/auth/signed-token.ts).
 */
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

/** Production minimum: 32 random bytes as base64url is 43 characters. */
export const MIN_PRODUCTION_SECRET_LENGTH = 43;
/** Cheap entropy floor: a random 43-char base64url string has ~30 distinct characters. */
export const MIN_PRODUCTION_SECRET_DISTINCT_CHARS = 16;

const SECRET_HINT = "generate one with the command in .env.example";

/** One IP address or CIDR range (IPv4 or IPv6); full validation happens in Better Auth. */
const ipOrCidr = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]*:[0-9a-fA-F:.]*)(?:\/\d{1,3})?$/;

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: postgresUrl,
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
    /**
     * Comma-separated IPs/CIDRs of the reverse proxies in front of the app. When set, the
     * forwarded-for chain is walked right to left past these hops (Better Auth
     * `advanced.ipAddress.trustedProxies`). When neither this nor AUTH_CLIENT_IP_HEADER is set,
     * src/proxy.ts strips client-supplied forwarding headers so the socket address is used.
     */
    AUTH_TRUSTED_PROXIES: z
      .string()
      .optional()
      .transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean))
      .refine((list) => list.every((e) => ipOrCidr.test(e)), "must be comma-separated IP addresses or CIDR ranges"),
    /** Header the deploy proxy sets to the client IP (default x-forwarded-for). */
    AUTH_CLIENT_IP_HEADER: z
      .string()
      .regex(/^[A-Za-z0-9-]{1,64}$/, "must be an HTTP header name")
      .transform((v) => v.toLowerCase())
      .optional(),
    /**
     * Public demo (/explore): "auto" (default) disables it while any non-demo study is active,
     * so prospective participants cannot preview both conditions; "on" / "off" force it.
     */
    PUBLIC_DEMO: z.enum(["auto", "on", "off"]).default("auto"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
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

let cached: ServerEnv | undefined;

/** Parse `source` (default `process.env`) or throw one readable error listing every problem. */
export function parseServerEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${issues}\nSee .env.example.`);
  }
  return result.data;
}

/** Validated, memoised server environment. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** Test helper: forget the memoised value. */
export function resetServerEnvCache(): void {
  cached = undefined;
}
