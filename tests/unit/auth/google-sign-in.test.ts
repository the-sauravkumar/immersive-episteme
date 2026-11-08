import { google } from "better-auth/social-providers";
import { describe, expect, it } from "vitest";

import { CATALOG } from "../../../scripts/deploy/lib/env-catalog";
import { isInviteExemptPath } from "@/lib/access/invite-paths";
import { googleOAuthCredentials, parseServerEnv } from "@/lib/env";
import { can } from "@/lib/permissions/can";
import { AWAITING_ACCESS_PATH, enterableAreas, FORBIDDEN_PATH, isAwaitingAccess, refusalPath, staffLanding } from "@/lib/permissions/console-routes";
import { contentSecurityPolicy } from "@/lib/security/csp";
import { googleSignInErrorMessage } from "@/components/shell/google-sign-in-errors";
import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_PROVIDER_ID,
  GOOGLE_SCOPES,
  googleProviderOptions,
  mayCreateUser,
  socialRequestRefusal,
  STAFF_ACCOUNT_LINKING,
} from "@/server/auth/google-sign-in";

const baseEnv = {
  DATABASE_URL: "postgres://u:p@localhost:5433/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

const credentials = { clientId: "1234567890-abc.apps.googleusercontent.com", clientSecret: "GOCSPX-test-secret" };

describe("Google sign-in configuration", () => {
  it("is off unless both variables are set, and refuses only one of them", () => {
    expect(googleOAuthCredentials(parseServerEnv(baseEnv))).toBeNull();
    expect(googleOAuthCredentials(parseServerEnv({ ...baseEnv, GOOGLE_CLIENT_ID: " ", GOOGLE_CLIENT_SECRET: "" }))).toBeNull();
    expect(
      googleOAuthCredentials(parseServerEnv({ ...baseEnv, GOOGLE_CLIENT_ID: credentials.clientId, GOOGLE_CLIENT_SECRET: credentials.clientSecret })),
    ).toEqual(credentials);
    expect(() => parseServerEnv({ ...baseEnv, GOOGLE_CLIENT_ID: credentials.clientId })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(() => parseServerEnv({ ...baseEnv, GOOGLE_CLIENT_SECRET: credentials.clientSecret })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("is in the deploy catalogue as optional, with the secret kept secret", () => {
    const byName = new Map(CATALOG.map((e) => [e.name, e]));
    expect(byName.get("GOOGLE_CLIENT_ID")).toMatchObject({ kind: "config", need: "optional" });
    expect(byName.get("GOOGLE_CLIENT_SECRET")).toMatchObject({ kind: "secret", need: "optional" });
  });

  it("asks Google for openid, email and profile only, on the documented callback", async () => {
    const provider = google(googleProviderOptions(credentials, "https://episteme.example.org"));
    const url = await provider.createAuthorizationURL({
      state: "state-value",
      codeVerifier: "a".repeat(64),
      redirectURI: "https://episteme.example.org/api/auth/callback/other",
    });
    expect(url.origin).toBe("https://accounts.google.com");
    expect(new Set(url.searchParams.get("scope")?.split(" "))).toEqual(new Set(GOOGLE_SCOPES));
    expect(url.searchParams.get("include_granted_scopes")).toBeNull();
    expect(url.searchParams.get("redirect_uri")).toBe(`https://episteme.example.org${GOOGLE_CALLBACK_PATH}`);
    expect(GOOGLE_CALLBACK_PATH).toBe("/api/auth/callback/google");
    expect(url.searchParams.get("client_id")).toBe(credentials.clientId);
    expect(provider.id).toBe(GOOGLE_PROVIDER_ID);
  });

  it("links only on a verified email: Google is not a trusted provider and emails must match", () => {
    expect(STAFF_ACCOUNT_LINKING).toEqual({
      enabled: true,
      trustedProviders: [],
      requireLocalEmailVerified: true,
      allowDifferentEmails: false,
      updateUserInfoOnLink: false,
    });
  });
});

describe("Google sign-in request rules", () => {
  it("accepts a plain Google redirect sign-in", () => {
    expect(socialRequestRefusal("/sign-in/social", { provider: "google", callbackURL: "/console" })).toBeNull();
  });

  it("refuses other providers, extra scopes, extra parameters, ID-token shortcuts and session linking", () => {
    expect(socialRequestRefusal("/sign-in/social", { provider: "github" })).not.toBeNull();
    expect(socialRequestRefusal("/sign-in/social", { provider: "google", scopes: ["https://www.googleapis.com/auth/drive"] })).not.toBeNull();
    expect(socialRequestRefusal("/sign-in/social", { provider: "google", additionalParams: { hd: "x" } })).not.toBeNull();
    expect(socialRequestRefusal("/sign-in/social", { provider: "google", idToken: { token: "t" } })).not.toBeNull();
    expect(socialRequestRefusal("/sign-in/social", undefined)).not.toBeNull();
    expect(socialRequestRefusal("/link-social", { provider: "google" })).not.toBeNull();
  });

  it("leaves every other auth route alone", () => {
    expect(socialRequestRefusal("/sign-in/email", { email: "a@b.c" })).toBeNull();
    expect(socialRequestRefusal("/get-session", undefined)).toBeNull();
  });

  it("makes a user through an auth endpoint only with an email Google verified", () => {
    expect(mayCreateUser({ emailVerified: true }, true)).toBe(true);
    expect(mayCreateUser({ emailVerified: false }, true)).toBe(false);
    expect(mayCreateUser({}, true)).toBe(false);
    expect(mayCreateUser({ emailVerified: true }, false)).toBe(true);
  });
});

describe("accounts without a role", () => {
  const pending = { roles: [] };
  const curator = { roles: ["curator"] } as const;

  it("open no console area and land on the waiting page", () => {
    expect(isAwaitingAccess(pending)).toBe(true);
    expect(enterableAreas(pending)).toEqual([]);
    expect(staffLanding(pending)).toBeNull();
    expect(can(pending, "admin.users")).toBe(false);
    expect(can(pending, "study.view")).toBe(false);
    expect(can(pending, "content.read")).toBe(false);
    expect(refusalPath(pending)).toBe(AWAITING_ACCESS_PATH);
  });

  it("while staff with a role are refused with the forbidden page", () => {
    expect(isAwaitingAccess(curator)).toBe(false);
    expect(refusalPath(curator)).toBe(FORBIDDEN_PATH);
  });

  it("reach the waiting page without an invite code", () => {
    expect(isInviteExemptPath(AWAITING_ACCESS_PATH)).toBe(true);
  });
});

describe("Google sign-in errors", () => {
  it("explain each callback refusal and fall back for unknown codes", () => {
    expect(googleSignInErrorMessage(null)).toBeNull();
    expect(googleSignInErrorMessage("account_not_linked")).toMatch(/not verified/);
    expect(googleSignInErrorMessage("unable_to_create_user")).toMatch(/no account was made/);
    expect(googleSignInErrorMessage("unable_to_create_session")).toMatch(/locked/);
    expect(googleSignInErrorMessage("something_else")).toMatch(/did not finish/);
  });
});

describe("Content-Security-Policy and the Google redirect", () => {
  it("needs no Google origin: the start is a same-origin fetch and the redirect a top-level navigation", () => {
    const csp = contentSecurityPolicy({ frameAncestors: "none", connectSrc: [] });
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("navigate-to");
    expect(csp).not.toContain("google");
  });
});
