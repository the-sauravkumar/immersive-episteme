import type { GoogleOptions } from "better-auth/social-providers";

import type { GoogleOAuthCredentials } from "@/lib/env";

export const GOOGLE_PROVIDER_ID = "google";
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";
export const GOOGLE_SCOPES = ["openid", "email", "profile"] as const;

export function googleProviderOptions(credentials: GoogleOAuthCredentials, baseURL: string): GoogleOptions {
  return {
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    redirectURI: new URL(GOOGLE_CALLBACK_PATH, baseURL).href,
    disableDefaultScope: true,
    scope: [...GOOGLE_SCOPES],
    includeGrantedScopes: false,
    prompt: "select_account",
  };
}

export const STAFF_ACCOUNT_LINKING = {
  enabled: true,
  trustedProviders: [],
  requireLocalEmailVerified: true,
  allowDifferentEmails: false,
  updateUserInfoOnLink: false,
};

const SOCIAL_SIGN_IN_PATH = "/sign-in/social";
const LINK_SOCIAL_PATH = "/link-social";

type SocialSignInBody = {
  provider?: unknown;
  scopes?: unknown;
  idToken?: unknown;
  additionalParams?: unknown;
};

export function socialRequestRefusal(path: string, body: unknown): string | null {
  if (path === LINK_SOCIAL_PATH) return "Linking a further sign-in method from a session is not offered.";
  if (path !== SOCIAL_SIGN_IN_PATH) return null;
  const request = (body ?? {}) as SocialSignInBody;
  if (request.provider !== GOOGLE_PROVIDER_ID) return "Only Google sign-in is offered.";
  if (request.idToken !== undefined) return "Google sign-in starts with a redirect to Google.";
  if (request.scopes !== undefined || request.additionalParams !== undefined) {
    return "Google sign-in requests only the openid, email and profile scopes.";
  }
  return null;
}

export function mayCreateUser(user: { emailVerified?: boolean | null }, fromAuthEndpoint: boolean): boolean {
  return !fromAuthEndpoint || user.emailVerified === true;
}
