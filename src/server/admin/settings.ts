/**
 * Effective platform configuration for /admin/settings (read-only). There is no settings
 * table: every value here is fixed by the deployment (environment variables) or by code, and
 * changing one is a deployment change. Secrets are never returned.
 */
import { DEFAULT_ACCOUNT_THROTTLE } from "@/server/auth/account-throttle";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/config";
import { ensure, type Actor } from "@/server/cms/core";

import { mediaStorageConfig } from "./health";

export interface SettingItem {
  label: string;
  value: string;
  /** Where the value comes from (env variable name or source file). */
  source: string;
}

export interface SettingGroup {
  title: string;
  items: SettingItem[];
}

export function effectiveSettings(actor: Actor, env: Record<string, string | undefined> = process.env): SettingGroup[] {
  ensure(actor, "admin.settings");
  const media = mediaStorageConfig(env);
  const proxies = (env.AUTH_TRUSTED_PROXIES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
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
        { label: "Sign-in rate limit (per IP)", value: "5 attempts per minute", source: "src/server/auth/config.ts" },
        { label: "Sign-in throttle (per account)", value: `${DEFAULT_ACCOUNT_THROTTLE.maxAttempts} attempts per ${DEFAULT_ACCOUNT_THROTTLE.windowSeconds / 60} minutes, then a ${DEFAULT_ACCOUNT_THROTTLE.lockSeconds / 60}-minute lock`, source: "src/server/auth/account-throttle.ts" },
        { label: "Self sign-up", value: "disabled; administrators create staff accounts", source: "src/server/auth/config.ts" },
        { label: "Trusted reverse proxies", value: proxies.length ? `${proxies.length} configured` : "none (socket address used)", source: "AUTH_TRUSTED_PROXIES" },
        { label: "Client IP header", value: env.AUTH_CLIENT_IP_HEADER || "x-forwarded-for (only from trusted proxies)", source: "AUTH_CLIENT_IP_HEADER" },
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
