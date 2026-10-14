import { describe, expect, it } from "vitest";

import { parseServerEnv } from "@/lib/env";

const valid = {
  DATABASE_URL: "postgres://u:p@localhost:5433/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseServerEnv", () => {
  it("accepts a minimal valid environment and applies defaults", () => {
    const env = parseServerEnv(valid);
    expect(env.APP_BUILD_VERSION).toBe("dev");
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => parseServerEnv({ ...valid, DATABASE_URL: "mysql://x/y" })).toThrow(/DATABASE_URL/);
  });

  it("rejects a short BETTER_AUTH_SECRET and lists every problem", () => {
    expect(() => parseServerEnv({ ...valid, BETTER_AUTH_SECRET: "short", BETTER_AUTH_URL: "nope" })).toThrow(
      /BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL|BETTER_AUTH_URL[\s\S]*BETTER_AUTH_SECRET/,
    );
  });
});

describe("BETTER_AUTH_SECRET hardening", () => {
  const strong = "Q3v9-Zt_x1LmP0aRk7sWdB4nYc8eHfGjU2oViK5lTqE"; // 43 chars, high variety (test value only)

  it.each([
    ["the .env.example placeholder", "replace-with-at-least-32-random-characters"],
    ["the CI placeholder", "ci-only-not-a-secret-0123456789abcdef0123456789"],
    ["an obvious placeholder", "changeme-changeme-changeme-changeme-123"],
  ])("rejects %s in every environment", (_label, secret) => {
    for (const NODE_ENV of ["development", "test", "production"]) {
      expect(() => parseServerEnv({ ...valid, NODE_ENV, BETTER_AUTH_SECRET: secret })).toThrow(/BETTER_AUTH_SECRET: is a documented placeholder/);
    }
  });

  it("requires a long, varied secret in production", () => {
    expect(() => parseServerEnv({ ...valid, NODE_ENV: "production", BETTER_AUTH_SECRET: "x".repeat(64) })).toThrow(/too weak for production/);
    expect(() => parseServerEnv({ ...valid, NODE_ENV: "production", BETTER_AUTH_SECRET: strong.slice(0, 40) })).toThrow(/too weak for production/);
    expect(parseServerEnv({ ...valid, NODE_ENV: "production", BETTER_AUTH_SECRET: strong }).BETTER_AUTH_SECRET).toBe(strong);
    // Development only enforces length and the placeholder list.
    expect(parseServerEnv({ ...valid, BETTER_AUTH_SECRET: "x".repeat(32) }).NODE_ENV).toBe("development");
  });
});

describe("auth client-IP and demo settings", () => {
  it("parses trusted proxies and rejects junk", () => {
    expect(parseServerEnv(valid).AUTH_TRUSTED_PROXIES).toEqual([]);
    expect(parseServerEnv({ ...valid, AUTH_TRUSTED_PROXIES: " 10.0.0.1, 10.1.0.0/16 ,fd00::/8" }).AUTH_TRUSTED_PROXIES).toEqual([
      "10.0.0.1",
      "10.1.0.0/16",
      "fd00::/8",
    ]);
    expect(() => parseServerEnv({ ...valid, AUTH_TRUSTED_PROXIES: "proxy.internal" })).toThrow(/AUTH_TRUSTED_PROXIES/);
    expect(parseServerEnv({ ...valid, AUTH_CLIENT_IP_HEADER: "CF-Connecting-IP" }).AUTH_CLIENT_IP_HEADER).toBe("cf-connecting-ip");
  });

  it("defaults the public demo to auto", () => {
    expect(parseServerEnv(valid).PUBLIC_DEMO).toBe("auto");
    expect(() => parseServerEnv({ ...valid, PUBLIC_DEMO: "yes" })).toThrow(/PUBLIC_DEMO/);
  });
});
