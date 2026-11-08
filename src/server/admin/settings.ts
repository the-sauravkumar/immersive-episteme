import { clientIpPolicy } from "@/lib/client-ip";
import { googleOAuthCredentials } from "@/lib/env";
import { DEFAULT_ACCOUNT_THROTTLE } from "@/server/auth/account-throttle";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/config";
import { ensure, type Actor } from "@/server/cms/core";

import { mediaStorageConfig } from "./health";

interface SettingItem {
  label: string;
  value: string;
  source: string;
}

export interface SettingGroup {
  title: string;
  items: SettingItem[];
}

export function effectiveSettings(actor: Actor, env: Record<string, string | undefined> = process.env): SettingGroup[] {
  ensure(actor, "admin.settings");
  const media = mediaStorageConfig(env);
  const google = googleOAuthCredentials(env) !== null;
  const proxies = (env.AUTH_TRUSTED_PROXIES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const knowsClientAddress = clientIpPolicy(env).trustForwardedHeaders;
  return [
    {
      title: "Build and access",
      items: [
        { label: "Application build", value: env.APP_BUILD_VERSION || "dev", source: "APP_BUILD_VERSION" },
        { label: "Runtime mode", value: env.NODE_ENV || "development", source: "NODE_ENV" },
        {
          label: "Public demo (/explore)",
          value: { auto: "auto: off while any real study is active", on: "on", off: "off" }[env.PUBLIC_DEMO ?? "auto"] ?? `invalid value "${env.PUBLIC_DEMO}"`,
          source: "PUBLIC_DEMO",
        },
      ],
    },
    {
      title: "Staff authentication",
      items: [
        { label: "Session lifetime", value: "12 hours, refreshed hourly", source: "src/server/auth/config.ts" },
        { label: "Minimum password length", value: `${MIN_PASSWORD_LENGTH} characters`, source: "src/server/auth/config.ts" },
        {
          label: "Sign-in rate limit",
          value: knowsClientAddress
            ? "5 attempts per minute per client address"
            : "5 attempts per minute shared by the whole site: no client address is known, so every visitor counts against one limit. Set AUTH_CLIENT_IP_HEADER or AUTH_TRUSTED_PROXIES",
          source: "src/server/auth/config.ts",
        },
        { label: "Sign-in throttle (per account)", value: `${DEFAULT_ACCOUNT_THROTTLE.maxAttempts} attempts per ${DEFAULT_ACCOUNT_THROTTLE.windowSeconds / 60} minutes, then a ${DEFAULT_ACCOUNT_THROTTLE.lockSeconds / 60}-minute lock`, source: "src/server/auth/account-throttle.ts" },
        {
          label: "Google sign-in",
          value: google ? "on: staff can sign in with Google" : "off: the Google OAuth client is not configured",
          source: "GOOGLE_CLIENT_ID",
        },
        {
          label: "Self sign-up",
          value: google
            ? "email and password sign-up is off; anyone with a verified Google account who signs in gets an account with no role, which opens nothing until an administrator adds a role"
            : "off; administrators create staff accounts",
          source: "src/server/auth/config.ts, src/server/auth/google-sign-in.ts",
        },
        { label: "Trusted reverse proxies", value: proxies.length ? `${proxies.length} configured` : "none", source: "AUTH_TRUSTED_PROXIES" },
        {
          label: "Client IP header",
          value: env.AUTH_CLIENT_IP_HEADER || (proxies.length ? "x-forwarded-for, read only from the trusted proxies" : "none: client address headers are removed and no address is read"),
          source: "AUTH_CLIENT_IP_HEADER",
        },
      ],
    },
    {
      title: "Media storage",
      items: [
        { label: "Mode", value: media.mode === "s3" ? "S3-compatible object storage (presigned uploads)" : "local disk (development fallback)", source: "MEDIA_S3_BUCKET" },
        ...(media.mode === "s3"
          ? [
              { label: "Bucket", value: media.bucket ?? "", source: "MEDIA_S3_BUCKET" },
              { label: "Endpoint", value: media.endpoint ?? "AWS default", source: "MEDIA_S3_ENDPOINT" },
            ]
          : [{ label: "Local directory", value: media.localDir, source: "MEDIA_LOCAL_DIR" }]),
      ],
    },
  ];
}
