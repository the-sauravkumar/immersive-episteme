/**
 * Deployment on Neon + Cloudflare R2 (decision record "Neon", number to confirm at merge):
 * the pooled/direct URL rules, the migration scripts' URL choice, the server-side checksum
 * fallback for stores without a single-part SHA-256, the invite-gate guard that runs before every
 * Vercel build, and the deploy kit's configuration.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { directDatabaseUrl, isPooledHost, parseServerEnv } from "@/lib/env";
import { mediaUploadOrigin } from "@/lib/security/csp";
import { parseMediaEnv, storedSha256 } from "@/server/cms/media/storage";

import { resolveDatabaseUrl } from "../../scripts/db/_shared";
import { inviteGateProblems } from "../../scripts/deploy/invite-gate";
import { CATALOG, FORBIDDEN } from "../../scripts/deploy/lib/env-catalog";

const POOLED = "postgresql://episteme_app:pw@ep-cool-name-a1b2c3d4-pooler.ap-southeast-1.aws.neon.tech/episteme?sslmode=verify-full";
const DIRECT = "postgresql://episteme_app:pw@ep-cool-name-a1b2c3d4.ap-southeast-1.aws.neon.tech/episteme?sslmode=verify-full";
const prod = {
  NODE_ENV: "production",
  DATABASE_URL: POOLED,
  BETTER_AUTH_SECRET: "Q7v-x2LmZ9pR4tYc8NwK1sHjD6fGbE3aU5oIzV0yXqT",
  BETTER_AUTH_URL: "https://ie.example.org",
};

describe("Neon: pooled app URL, direct URL for LISTEN and migrations", () => {
  it("recognises Neon's pooler host", () => {
    expect(isPooledHost(POOLED)).toBe(true);
    expect(isPooledHost(DIRECT)).toBe(false);
    expect(isPooledHost("postgres://u:p@localhost:5433/db")).toBe(false);
  });

  it("requires DATABASE_URL_UNPOOLED in production when DATABASE_URL is pooled, and refuses a pooled one", () => {
    expect(() => parseServerEnv(prod)).toThrow(/DATABASE_URL_UNPOOLED: is required/);
    const env = parseServerEnv({ ...prod, DATABASE_URL_UNPOOLED: DIRECT });
    expect(directDatabaseUrl(env)).toBe(DIRECT);
    expect(() => parseServerEnv({ ...prod, DATABASE_URL_UNPOOLED: POOLED })).toThrow(/pooled \(-pooler\) host/);
    // No RDS CA rule on Neon: the chain ends at ISRG Root X1, in Node's default store.
    expect(() => parseServerEnv({ ...prod, DATABASE_URL_UNPOOLED: DIRECT })).not.toThrow();
  });

  it("uses DATABASE_URL for everything when no direct URL is set (local Docker, CI)", () => {
    const env = parseServerEnv({ ...prod, NODE_ENV: "development", DATABASE_URL: "postgres://u:p@localhost:5433/db" });
    expect(directDatabaseUrl(env)).toBe("postgres://u:p@localhost:5433/db");
  });

  describe("database scripts", () => {
    const saved = { main: process.env.DATABASE_URL, direct: process.env.DATABASE_URL_UNPOOLED, test: process.env.TEST_DATABASE_URL };
    afterEach(() => {
      for (const [k, v] of [["DATABASE_URL", saved.main], ["DATABASE_URL_UNPOOLED", saved.direct], ["TEST_DATABASE_URL", saved.test]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });

    it("migrate on the direct URL when it is set; --test is unaffected", () => {
      process.env.DATABASE_URL = POOLED;
      process.env.DATABASE_URL_UNPOOLED = DIRECT;
      process.env.TEST_DATABASE_URL = "postgres://u:p@localhost:5433/episteme_test";
      expect(resolveDatabaseUrl([])).toEqual({ url: DIRECT, label: "main" });
      expect(resolveDatabaseUrl(["--test"]).url).toBe("postgres://u:p@localhost:5433/episteme_test");
      delete process.env.DATABASE_URL_UNPOOLED;
      expect(resolveDatabaseUrl([]).url).toBe(POOLED);
    });
  });
});

describe("Cloudflare R2: S3-compatible media store", () => {
  const r2 = {
    MEDIA_S3_BUCKET: "ie-media",
    MEDIA_S3_REGION: "auto",
    MEDIA_S3_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    MEDIA_S3_FORCE_PATH_STYLE: "true",
  };

  it("parses the R2 settings and puts the account endpoint in the CSP", () => {
    expect(parseMediaEnv(r2).MEDIA_S3_REGION).toBe("auto");
    expect(mediaUploadOrigin(r2)).toBe("https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com");
  });

  const sha = "a".repeat(64);
  it("uses the store's checksum when it reports one, and never downloads", async () => {
    const storage = { sha256Of: async () => { throw new Error("should not download"); } };
    await expect(storedSha256(storage, "k", { byteSize: 10, sha256: sha }, 100)).resolves.toBe(sha);
  });

  it("hashes the stored object on the server when the store reports none (R2)", async () => {
    const calls: Array<[string, number]> = [];
    const storage = { sha256Of: async (key: string, max: number) => (calls.push([key, max]), "b".repeat(64)) };
    await expect(storedSha256(storage, "sha256/aa/x.jpg", { byteSize: 10, sha256: null }, 100)).resolves.toBe("b".repeat(64));
    expect(calls).toEqual([["sha256/aa/x.jpg", 100]]);
  });

  it("refuses an object over the type's limit before downloading it", async () => {
    const storage = { sha256Of: async () => sha };
    await expect(storedSha256(storage, "k", { byteSize: 101, sha256: null }, 100)).rejects.toMatchObject({ code: "too_large" });
  });
});

describe("Invite gate before every production build (CLI deploys too)", () => {
  it("finds the gate in this repository", () => {
    expect(inviteGateProblems(process.cwd())).toEqual([]);
  });

  it("reports a proxy without the gate, and an environment switch", () => {
    const dir = mkdtempSync(join(tmpdir(), "ie-gate-"));
    try {
      cpSync("src/lib/access/invite-paths.ts", join(dir, "src/lib/access/invite-paths.ts"));
      cpSync("src/server/access/invite-cookie.ts", join(dir, "src/server/access/invite-cookie.ts"));
      const proxy = readFileSync("src/proxy.ts", "utf8");
      writeFileSync(join(dir, "src/proxy.ts"), proxy.replace(/if \(!invited\) \{/, "if (false) {"));
      expect(inviteGateProblems(dir)).toEqual(["src/proxy.ts has no branch refusing visitors without an invite"]);
      writeFileSync(join(dir, "src/proxy.ts"), proxy.replace("const invited = ", "const invited = process.env.SITE_OPEN === '1' || "));
      expect(inviteGateProblems(dir).join()).toMatch(/environment switch/);
      rmSync(join(dir, "src/proxy.ts"));
      expect(inviteGateProblems(dir)).toEqual(["src/proxy.ts is missing"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("vercel.json runs the guard before the build and puts functions in Singapore, next to Neon", () => {
    const vj = JSON.parse(readFileSync("vercel.json", "utf8")) as { buildCommand: string; regions: string[] };
    expect(vj.buildCommand).toBe("node scripts/deploy/invite-gate.ts --if-production && npm run build");
    expect(vj.regions).toEqual(["sin1"]);
  });
});

describe("Deploy kit catalogue", () => {
  it("accepts the Neon direct URL and the R2 settings, as secrets where they carry credentials", () => {
    const byName = new Map(CATALOG.map((e) => [e.name, e]));
    expect(byName.get("DATABASE_URL_UNPOOLED")?.kind).toBe("secret");
    expect(byName.get("MEDIA_S3_ENDPOINT")?.kind).toBe("config");
    expect(byName.get("MEDIA_S3_FORCE_PATH_STYLE")?.kind).toBe("config");
    expect(byName.get("MEDIA_S3_SECRET_ACCESS_KEY")?.need).toBe("required");
    expect(FORBIDDEN.MEDIA_S3_ENDPOINT).toBeUndefined();
    expect(FORBIDDEN.TEST_DATABASE_URL).toBeDefined();
  });
});
