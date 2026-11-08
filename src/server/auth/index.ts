import "server-only";

import { googleOAuthCredentials, serverEnv } from "@/lib/env";
import { getDb } from "@/server/db/client";

import { createAuth, type Auth } from "./config";

type AuthGlobal = typeof globalThis & { __episteme_auth?: Auth };
const g = globalThis as AuthGlobal;

export function getAuth(): Auth {
  if (!g.__episteme_auth) {
    const env = serverEnv();
    g.__episteme_auth = createAuth({
      db: getDb(),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      trustedProxies: env.AUTH_TRUSTED_PROXIES,
      clientIpHeader: env.AUTH_CLIENT_IP_HEADER,
      google: googleOAuthCredentials(env),
      superAdminEmails: env.SUPER_ADMIN_EMAILS,
      nextjs: true,
    });
  }
  return g.__episteme_auth;
}

export function googleSignInEnabled(): boolean {
  return googleOAuthCredentials(serverEnv()) !== null;
}

export type { Auth } from "./config";
