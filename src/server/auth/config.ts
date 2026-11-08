import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { authAccounts, authRateLimits, authSessions, authVerifications, users } from "@db/schema/auth";
import { ACCOUNT_THROTTLED_CODE, accountThrottledMessage } from "@/lib/access/sign-in-errors";
import type { GoogleOAuthCredentials } from "@/lib/env";

import {
  clearSignInAttempts,
  consumeSignInAttempt,
  DEFAULT_ACCOUNT_THROTTLE,
  signInThrottleKey,
  type AccountThrottleOptions,
} from "./account-throttle";
import { AUTH_COOKIE_PREFIX } from "./cookie-names";
import { GOOGLE_PROVIDER_ID, googleProviderOptions, mayCreateUser, socialRequestRefusal, STAFF_ACCOUNT_LINKING } from "./google-sign-in";
import { grantListedSuperAdmin } from "./super-admin";

const AUTH_SCHEMA = {
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
  secureCookies?: boolean;
  nextjs?: boolean;
  rateLimit?: boolean;
  trustedOrigins?: string[];
  trustedProxies?: string[];
  clientIpHeader?: string;
  accountThrottle?: AccountThrottleOptions | false;
  google?: GoogleOAuthCredentials | null;
  superAdminEmails?: readonly string[];
};

const SIGN_IN_PATH = "/sign-in/email";
const SIGN_IN_ERROR_PATH = "/sign-in";

const KNOWN_DEVICE_COOKIE = "known_device";
export const KNOWN_DEVICE_MAX_AGE = 60 * 60 * 24 * 90;
export const STAFF_SESSION_SECONDS = 60 * 60 * 12;

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
    socialProviders: opts.google ? { [GOOGLE_PROVIDER_ID]: googleProviderOptions(opts.google, opts.baseURL) } : {},
    account: {
      encryptOAuthTokens: true,
      accountLinking: STAFF_ACCOUNT_LINKING,
    },
    onAPIError: { errorURL: SIGN_IN_ERROR_PATH },
    user: {
      additionalFields: {
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    session: {
      expiresIn: STAFF_SESSION_SECONDS,
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
        "/sign-in/social": { window: 60, max: 10 },
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
        const refusal = socialRequestRefusal(ctx.path, ctx.body);
        if (refusal) throw new APIError("FORBIDDEN", { message: refusal, code: "SOCIAL_REQUEST_REFUSED" });
        if (!throttle || ctx.path !== SIGN_IN_PATH) return;
        const email: unknown = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== "string" || email.length === 0) return;
        const device = ctx.context.createAuthCookie(KNOWN_DEVICE_COOKIE);
        const known = (await ctx.getSignedCookie(device.name, ctx.context.secret)) === signInThrottleKey(email);
        const decision = await consumeSignInAttempt(db, email, throttle, new Date(), known ? "known_device" : "account");
        if (!decision.allowed) {
          throw new APIError(
            "TOO_MANY_REQUESTS",
            { message: accountThrottledMessage(decision.retryAfterSeconds), code: ACCOUNT_THROTTLED_CODE },
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
      user: {
        create: {
          before: async (user, ctx) => {
            if (!mayCreateUser(user, Boolean(ctx))) return false;
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [row] = await db
              .select({ id: users.id, email: users.email, emailVerified: users.emailVerified, disabledAt: users.disabledAt })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            if (!row || row.disabledAt) return false;
            await grantListedSuperAdmin(db, row, opts.superAdminEmails ?? []);
          },
        },
      },
    },
    plugins: opts.nextjs ? [nextCookies()] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
