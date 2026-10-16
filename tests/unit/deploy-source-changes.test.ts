/**
 * Deployment source changes (docs/deploy/RESEARCH.md s13): S3 (RDS CA), S5 (explicit S3 keys in
 * production), S1 (stream maxDuration), S6/S7 (image caching), S8 (.gitignore), S9 (.vercelignore),
 * S10 (engines), S12 (build version from the Vercel commit).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isRdsHost, parseServerEnv, withBuildVersion } from "@/lib/env";
import { assertExplicitS3Credentials, parseMediaEnv } from "@/server/cms/media/storage";
import { pgConnectionConfig } from "@/server/db/connection-config";

const PEM = "-----BEGIN CERTIFICATE-----\nMIIBszCCAVmgAwIBAgIUQ\n-----END CERTIFICATE-----";
const RDS = "postgres://episteme_app:pw@ie.abc123.ap-south-1.rds.amazonaws.com:5432/episteme?sslmode=verify-full";
const prod = {
  NODE_ENV: "production",
  DATABASE_URL: RDS,
  BETTER_AUTH_SECRET: "Q7v-x2LmZ9pR4tYc8NwK1sHjD6fGbE3aU5oIzV0yXqT",
  BETTER_AUTH_URL: "https://ie.example.org",
};

describe("S3: RDS certificate authority", () => {
  it("requires DATABASE_CA_PEM in production on an RDS host only", () => {
    expect(() => parseServerEnv(prod)).toThrow(/DATABASE_CA_PEM/);
    expect(parseServerEnv({ ...prod, DATABASE_CA_PEM: PEM }).DATABASE_CA_PEM).toBe(PEM);
    expect(() => parseServerEnv({ ...prod, DATABASE_URL: "postgres://u:p@db.internal:5432/x" })).not.toThrow();
    expect(() => parseServerEnv({ ...prod, NODE_ENV: "development", BETTER_AUTH_SECRET: "x".repeat(32) })).not.toThrow();
    expect(isRdsHost(RDS)).toBe(true);
    expect(isRdsHost("postgres://u:p@localhost:5433/db")).toBe(false);
  });

  it("accepts a one-line value with literal \\n and rejects a value that is not a PEM", () => {
    expect(parseServerEnv({ ...prod, DATABASE_CA_PEM: PEM.replaceAll("\n", "\\n") }).DATABASE_CA_PEM).toBe(PEM);
    expect(() => parseServerEnv({ ...prod, DATABASE_CA_PEM: "not a certificate" })).toThrow(/PEM/);
  });

  it("strips the URL's TLS parameters and pins the CA (pg would otherwise drop it)", () => {
    const cfg = pgConnectionConfig(`${RDS}&sslrootcert=/tmp/x.pem&application_name=a`, PEM);
    expect(cfg.ssl).toEqual({ ca: PEM, rejectUnauthorized: true });
    const url = new URL(cfg.connectionString);
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.has("sslrootcert")).toBe(false);
    expect(url.searchParams.get("application_name")).toBe("a");
    expect(url.hostname).toBe("ie.abc123.ap-south-1.rds.amazonaws.com");
    expect(url.password).toBe("pw");
  });

  it("leaves the URL untouched without a CA, and refuses sslmode=disable with one", () => {
    expect(pgConnectionConfig("postgres://u:p@localhost:5433/db")).toEqual({ connectionString: "postgres://u:p@localhost:5433/db" });
    expect(() => pgConnectionConfig("postgres://u:p@h/db?sslmode=disable", PEM)).toThrow(/sslmode=disable/);
  });
});

describe("S12: build version from the deployed commit", () => {
  it("defaults APP_BUILD_VERSION to the short VERCEL_GIT_COMMIT_SHA; an explicit value wins", () => {
    const sha = "3b88b65a0c1d2e3f405162738495a6b7c8d9e0f1";
    expect(withBuildVersion({ VERCEL_GIT_COMMIT_SHA: sha }).APP_BUILD_VERSION).toBe("3b88b65");
    expect(withBuildVersion({ VERCEL_GIT_COMMIT_SHA: sha, APP_BUILD_VERSION: "" }).APP_BUILD_VERSION).toBe("3b88b65");
    expect(withBuildVersion({ VERCEL_GIT_COMMIT_SHA: sha, APP_BUILD_VERSION: "manual1" }).APP_BUILD_VERSION).toBe("manual1");
    expect(withBuildVersion({ VERCEL_GIT_COMMIT_SHA: "not-a-sha" }).APP_BUILD_VERSION).toBeUndefined();
    const base = { DATABASE_URL: "postgres://u:p@localhost:5433/db", BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "http://localhost:3000" };
    expect(parseServerEnv({ ...base, VERCEL_GIT_COMMIT_SHA: sha }).APP_BUILD_VERSION).toBe("3b88b65");
    expect(parseServerEnv({ ...base, APP_BUILD_VERSION: "" }).APP_BUILD_VERSION).toBe("dev");
  });
});

describe("S5: explicit S3 credentials in production", () => {
  const s3 = { MEDIA_S3_BUCKET: "ie-media", MEDIA_S3_REGION: "ap-south-1" };
  it("refuses the default credential chain in production (Vercel's AWS_* placeholders)", () => {
    const placeholders = { ...s3, NODE_ENV: "production", AWS_ACCESS_KEY_ID: "ASIAPLACEHOLDER", AWS_SECRET_ACCESS_KEY: "x" };
    expect(() => assertExplicitS3Credentials(parseMediaEnv(placeholders), placeholders)).toThrow(/MEDIA_S3_ACCESS_KEY_ID/);
    const oidcOnly = { ...s3, NODE_ENV: "production", AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/x" };
    expect(() => assertExplicitS3Credentials(parseMediaEnv(oidcOnly), oidcOnly)).toThrow(/OIDC credentials are not supported/);
  });

  it("accepts explicit keys in production and the default chain outside production", () => {
    const keys = { ...s3, NODE_ENV: "production", MEDIA_S3_ACCESS_KEY_ID: "AKIAEXAMPLE", MEDIA_S3_SECRET_ACCESS_KEY: "secret" };
    expect(() => assertExplicitS3Credentials(parseMediaEnv(keys), keys)).not.toThrow();
    const dev = { ...s3, NODE_ENV: "development" };
    expect(() => assertExplicitS3Credentials(parseMediaEnv(dev), dev)).not.toThrow();
  });
});

describe("S1: dashboard stream duration", () => {
  it("declares maxDuration as a literal and closes the stream before it", () => {
    const src = readFileSync("src/app/api/research/dashboard/stream/route.ts", "utf8");
    expect(src).toMatch(/^export const maxDuration = 300;$/m);
    expect(src).toMatch(/setTimeout\(\(\) => cleanup\(\), STREAM_LIFETIME_MS\)/);
    expect(src).toMatch(/clearTimeout\(lifetime\)/);
  });
});

describe("S6/S7: image caching", () => {
  it("locks the image optimiser to /figures without a query and makes museum textures immutable", async () => {
    const { default: config } = await import("../../next.config");
    expect(config.images?.localPatterns).toEqual([{ pathname: "/figures/**", search: "" }]);
    expect(config.images?.minimumCacheTTL).toBe(60);
    const headers = await config.headers!();
    const museum = headers.find((h) => h.source.startsWith("/museum/textures/"));
    expect(museum?.headers).toEqual([{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]);
    // path-to-regexp source: the hashed names in public/museum/textures match the pattern.
    const pattern = new RegExp(`^${museum!.source.replace("/museum/textures/:file(", "").replace(/\)$/, "")}$`);
    expect(pattern.test("floor-color.3b88b65a.ktx2")).toBe(true);
    expect(pattern.test("index.json")).toBe(false);
  });

  it("serves figures with a private cache (the site is invite-only)", () => {
    const src = readFileSync("src/app/figures/[assetId]/route.ts", "utf8");
    expect(src).toContain('"Cache-Control": `private, max-age=${maxAge}, must-revalidate`');
    expect(src).not.toContain("`public, max-age=${maxAge}");
  });
});

describe("S8/S9/S10: repository files", () => {
  it("lets .env.production.example be committed while every other .env file stays ignored", () => {
    const ignored = (p: string) => {
      try {
        execFileSync("git", ["check-ignore", "-q", "--no-index", p]);
        return true;
      } catch {
        return false;
      }
    };
    expect(ignored(".env.production.example")).toBe(false);
    expect(ignored(".env.example")).toBe(false);
    expect(ignored(".env")).toBe(true);
    expect(ignored(".env.production")).toBe(true);
  });

  it("keeps secrets and bulky local output out of CLI uploads", () => {
    const lines = readFileSync(".vercelignore", "utf8").split(/\r?\n/).map((l) => l.trim());
    for (const entry of [".env", ".env.*", ".data/", "analysis/out/", "test-results/", "tests/e2e/immersive-baselines/"]) expect(lines).toContain(entry);
    expect(lines).not.toContain("content/");
  });

  it("pins Node 24.x in the documented engines form", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { engines: { node: string } };
    expect(pkg.engines.node).toBe("24.x");
  });
});
