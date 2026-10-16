/**
 * Better Auth factory for staff accounts (email + password, Drizzle/Postgres).
 *
 * Deliberately NOT `server-only`: scripts/create-admin.ts and the integration tests build an
 * instance against their own pool. App code must use `getAuth()` from ./index.ts instead.
 *
 * Choices:
 *  - Sign-up endpoint disabled. Accounts are created by an administrator
 *    (scripts/create-admin.ts or, later, /admin/users) via ./bootstrap.ts.
 *  - Rate limiting always on (Better Auth enables it only in production by default), stored
 *    in Postgres so it survives restarts and is shared between server processes. Sign-in is
 *    held to 5 attempts per minute per IP. Better Auth only rate-limits requests that come
 *    through its HTTP router (/api/auth/*), so sign-in/out must go through that route, never
 *    `auth.api.*` from a server action.
 *  - The client IP used as the rate-limit key is only taken from forwarding headers the
 *    deployment vouches for (`trustedProxies` / `clientIpHeader`, from AUTH_TRUSTED_PROXIES /
 *    AUTH_CLIENT_IP_HEADER). Without a proxy, src/proxy.ts strips client-supplied forwarding
 *    headers so Next.js fills in the socket address (src/lib/client-ip.ts).
 *  - Per-account throttle on /sign-in/email (./account-throttle.ts): at most 10 attempts per
 *    15 minutes per email, from any number of IPs, then a 15-minute lock (HTTP 429). A browser
 *    that signed in to the account before (signed `known_device` cookie, 90 days) is counted in
 *    its own bucket, so a stranger who locks the email does not lock out its owner (security-09).
 *  - Secure cookies in production (`__Secure-` prefix), httpOnly, SameSite=Lax.
 *  - 12h sessions refreshed hourly: a research console, not a consumer app.
 *  - The admin plugin is not used: it models a single `user.role` string, while this project
 *    needs many roles per user (`user_roles`) checked against src/lib/permissions.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { authAccounts, authRateLimits, authSessions, authVerifications, users } from "@db/schema/auth";

import {
  clearSignInAttempts,
  consumeSignInAttempt,
  DEFAULT_ACCOUNT_THROTTLE,
  signInThrottleKey,
  type AccountThrottleOptions,
} from "./account-throttle";
import { AUTH_COOKIE_PREFIX } from "./cookie-names";

export const AUTH_SCHEMA = {
  user: users,
  session: authSessions,
  account: authAccounts,
  verification: authVerifications,
  rateLimit: authRateLimits,
} as const;

export const MIN_PASSWORD_LENGTH = 12;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle pg database works
type AnyPgDatabase = NodePgDatabase<any>;

export type CreateAuthOptions = {
  db: AnyPgDatabase;
  secret: string;
  baseURL: string;
  /** Force `Secure` cookies (default: production only). */
  secureCookies?: boolean;
  /** Install the next/headers cookie bridge (app only; scripts/tests leave it off). */
  nextjs?: boolean;
  /** Rate limiting (default on). Tests that exercise many sign-ins may turn it off. */
  rateLimit?: boolean;
  /** Extra trusted origins besides baseURL. */
  trustedOrigins?: string[];
  /** Reverse-proxy IPs/CIDRs whose forwarding hops are skipped (AUTH_TRUSTED_PROXIES). */
  trustedProxies?: string[];
  /** Header carrying the client IP (AUTH_CLIENT_IP_HEADER; default x-forwarded-for). */
  clientIpHeader?: string;
  /** Per-account sign-in throttle (default on, see ./account-throttle.ts); false disables it. */
  accountThrottle?: AccountThrottleOptions | false;
};

const SIGN_IN_PATH = "/sign-in/email";

/**
 * Signed "this browser signed in to this account before" cookie (OWASP device cookies). Its
 * value is the account's throttle key (sha256 of the email), never the address itself.
 */
export const KNOWN_DEVICE_COOKIE = "known_device";
const KNOWN_DEVICE_MAX_AGE = 60 * 60 * 24 * 90;

export function createAuth(opts: CreateAuthOptions) {
  const { db } = opts;
  const throttle = opts.accountThrottle === false ? null : (opts.accountThrottle ?? DEFAULT_ACCOUNT_THROTTLE);
  return betterAuth({
    appName: "Immersive Episteme",
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: "/api/auth",
    trustedOrigins: [opts.baseURL, ...(opts.trustedOrigins ?? [])],
    database: drizzleAdapter(db, { provider: "pg", schema: AUTH_SCHEMA }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: 256,
      revokeSessionsOnPasswordReset: true,
    },
    user: {
      additionalFields: {
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
    },
    rateLimit: {
      enabled: opts.rateLimit ?? true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
        "/get-session": false,
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: [opts.clientIpHeader ?? "x-forwarded-for"],
        ...(opts.trustedProxies?.length ? { trustedProxies: opts.trustedProxies } : {}),
      },
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: opts.secureCookies ?? process.env.NODE_ENV === "production",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!throttle || ctx.path !== SIGN_IN_PATH) return;
        const email: unknown = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== "string" || email.length === 0) return;
        const device = ctx.context.createAuthCookie(KNOWN_DEVICE_COOKIE);
        const known = (await ctx.getSignedCookie(device.name, ctx.context.secret)) === signInThrottleKey(email);
        const decision = await consumeSignInAttempt(db, email, throttle, new Date(), known ? "known_device" : "account");
        if (!decision.allowed) {
          throw new APIError(
            "TOO_MANY_REQUESTS",
            { message: "Too many sign-in attempts for this account. Try again later.", code: "ACCOUNT_THROTTLED" },
            { "Retry-After": String(decision.retryAfterSeconds) },
          );
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (!throttle || ctx.path !== SIGN_IN_PATH) return;
        const signedIn = ctx.context.newSession?.user.email;
        if (!signedIn) return;
        await clearSignInAttempts(db, signedIn);
        const device = ctx.context.createAuthCookie(KNOWN_DEVICE_COOKIE, { maxAge: KNOWN_DEVICE_MAX_AGE });
        await ctx.setSignedCookie(device.name, signInThrottleKey(signedIn), ctx.context.secret, device.attributes);
      }),
    },
    databaseHooks: {
      session: {
        create: {
          // Locked accounts cannot sign in (returning false aborts session creation).
          before: async (session) => {
            const [row] = await db
              .select({ disabledAt: users.disabledAt })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            if (!row || row.disabledAt) return false;
          },
        },
      },
    },
    // nextCookies must be the last plugin.
    plugins: opts.nextjs ? [nextCookies()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
