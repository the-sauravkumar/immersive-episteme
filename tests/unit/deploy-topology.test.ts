/**
 * Provider-neutral deploy preflight (scripts/deploy/lib/topology.ts): the deployer picks Neon or
 * RDS and R2 or S3; preflight detects the choice and names the one vercel.json region it needs.
 */
import { describe, expect, it } from "vitest";

import { detectDatabase, detectMedia, topologyChecks, type TopologyRow } from "../../scripts/deploy/lib/topology";

const NEON_POOLED = "postgresql://episteme_app:pw@ep-cool-name-a1b2c3d4-pooler.ap-southeast-1.aws.neon.tech/episteme?sslmode=verify-full";
const NEON_DIRECT = "postgresql://episteme_app:pw@ep-cool-name-a1b2c3d4.ap-southeast-1.aws.neon.tech/episteme?sslmode=verify-full";
const RDS = "postgres://episteme_app:pw@ie.abc123.ap-south-1.rds.amazonaws.com:5432/episteme?sslmode=verify-full";
const R2 = {
  MEDIA_S3_BUCKET: "ie-media",
  MEDIA_S3_REGION: "auto",
  MEDIA_S3_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
  MEDIA_S3_FORCE_PATH_STYLE: "true",
};
const PEM = "-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----";

const failing = (rows: TopologyRow[]) => rows.filter((r) => !r.ok && r.level !== "info").map((r) => r.check);

describe("detection", () => {
  it("reads the provider and AWS region from the database host", () => {
    expect(detectDatabase(NEON_POOLED)).toMatchObject({ provider: "neon", awsRegion: "ap-southeast-1" });
    expect(detectDatabase(RDS)).toMatchObject({ provider: "rds", awsRegion: "ap-south-1" });
    expect(detectDatabase("postgres://u:p@db.example.org/x")).toMatchObject({ provider: "other", awsRegion: null });
    expect(detectDatabase(undefined)).toBeNull();
    expect(detectDatabase("not a url")).toBeNull();
  });

  it("tells R2, AWS S3 and other S3-compatible stores apart", () => {
    expect(detectMedia(R2)).toBe("r2");
    expect(detectMedia({ MEDIA_S3_BUCKET: "b", MEDIA_S3_REGION: "ap-south-1" })).toBe("s3");
    expect(detectMedia({ MEDIA_S3_BUCKET: "b", MEDIA_S3_ENDPOINT: "https://minio.example.org" })).toBe("s3-compatible");
    expect(detectMedia({})).toBe("none");
  });
});

describe("Neon", () => {
  const env = { DATABASE_URL: NEON_POOLED, DATABASE_URL_UNPOOLED: NEON_DIRECT, ...R2 };

  it("passes with sin1 for aws-ap-southeast-1 and the direct URL set", () => {
    const t = topologyChecks(env, ["sin1"]);
    expect(t.functionRegion).toBe("sin1");
    expect(failing(t.rows)).toEqual([]);
  });

  it("fails on another function region and names the one to set", () => {
    const t = topologyChecks(env, ["bom1"]);
    const row = t.rows.find((r) => r.check.startsWith("vercel.json regions"))!;
    expect(row.ok).toBe(false);
    expect(row.detail).toContain('set "regions": ["sin1"]');
    expect(failing(topologyChecks(env, undefined).rows)).toEqual(['vercel.json regions = ["sin1"]']);
    expect(failing(topologyChecks(env, ["sin1", "bom1"]).rows)).toEqual(['vercel.json regions = ["sin1"]']);
  });

  it("requires DATABASE_URL_UNPOOLED", () => {
    expect(failing(topologyChecks({ ...env, DATABASE_URL_UNPOOLED: undefined }, ["sin1"]).rows)).toEqual(["Neon: DATABASE_URL_UNPOOLED set"]);
  });

  it("refuses a Neon region with no known function region", () => {
    const t = topologyChecks({ ...env, DATABASE_URL: NEON_POOLED.replace("ap-southeast-1", "eu-central-1") }, ["sin1"]);
    expect(t.functionRegion).toBeNull();
    expect(failing(t.rows)).toEqual(["Neon region supported", "vercel.json regions"]);
  });
});

describe("Amazon RDS", () => {
  const env = { DATABASE_URL: RDS, DATABASE_CA_PEM: PEM, MEDIA_S3_BUCKET: "ie-media", MEDIA_S3_REGION: "ap-south-1" };

  it("passes with bom1, ap-south-1 and the CA", () => {
    const t = topologyChecks(env, ["bom1"]);
    expect(t.functionRegion).toBe("bom1");
    expect(failing(t.rows)).toEqual([]);
  });

  it("requires the CA, Mumbai and bom1", () => {
    expect(failing(topologyChecks({ ...env, DATABASE_CA_PEM: undefined }, ["bom1"]).rows)).toEqual(["RDS: DATABASE_CA_PEM set"]);
    expect(failing(topologyChecks(env, ["sin1"]).rows)).toEqual(['vercel.json regions = ["bom1"]']);
    const sg = { ...env, DATABASE_URL: RDS.replace("ap-south-1", "ap-southeast-1"), MEDIA_S3_REGION: "ap-southeast-1" };
    expect(failing(topologyChecks(sg, ["bom1"]).rows)).toEqual(["RDS in ap-south-1"]);
  });

  it("does not need DATABASE_URL_UNPOOLED", () => {
    expect(topologyChecks(env, ["bom1"]).rows.some((r) => r.check.includes("UNPOOLED"))).toBe(false);
  });
});

describe("media stores, each checked as it is", () => {
  it("R2: region auto and path-style", () => {
    const base = { DATABASE_URL: NEON_POOLED, DATABASE_URL_UNPOOLED: NEON_DIRECT };
    expect(failing(topologyChecks({ ...base, ...R2, MEDIA_S3_REGION: "ap-southeast-1", MEDIA_S3_FORCE_PATH_STYLE: undefined }, ["sin1"]).rows)).toEqual([
      "R2: MEDIA_S3_REGION auto",
      "R2: path-style",
    ]);
  });

  it("AWS S3: the bucket in the database's region, with either database", () => {
    const neonS3 = { DATABASE_URL: NEON_POOLED, DATABASE_URL_UNPOOLED: NEON_DIRECT, MEDIA_S3_BUCKET: "b", MEDIA_S3_REGION: "ap-southeast-1" };
    expect(failing(topologyChecks(neonS3, ["sin1"]).rows)).toEqual([]);
    expect(failing(topologyChecks({ ...neonS3, MEDIA_S3_REGION: "ap-south-1" }, ["sin1"]).rows)).toEqual(["S3 bucket in the database's region"]);
    const rdsS3 = { DATABASE_URL: RDS, DATABASE_CA_PEM: PEM, MEDIA_S3_BUCKET: "b", MEDIA_S3_REGION: "ap-south-1", AWS_ROLE_ARN: "arn:aws:iam::1:role/x", AWS_REGION: "us-east-1" };
    expect(failing(topologyChecks(rdsS3, ["bom1"]).rows)).toEqual(["AWS_REGION with OIDC"]);
  });

  it("an S3-compatible store that is neither is a warning, and must be https", () => {
    const t = topologyChecks({ DATABASE_URL: RDS, DATABASE_CA_PEM: PEM, MEDIA_S3_BUCKET: "b", MEDIA_S3_ENDPOINT: "http://minio.local" }, ["bom1"]);
    expect(t.rows.find((r) => r.check === "S3-compatible store")).toMatchObject({ ok: false, level: "warn" });
    expect(t.rows.find((r) => r.check === "MEDIA_S3_ENDPOINT https")).toMatchObject({ ok: false, level: "rule" });
  });
});

describe("unknown database host", () => {
  it("fails instead of guessing a region", () => {
    expect(failing(topologyChecks({ DATABASE_URL: "postgres://u:p@db.example.org/x" }, ["sin1"]).rows)).toEqual(["database provider recognised", "vercel.json regions"]);
  });
});
