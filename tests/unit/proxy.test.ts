/**
 * src/proxy.ts: client-IP header stripping on /api/auth/* (sign-in rate-limit keys) and the
 * Content-Security-Policy on the responses the proxy creates itself.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clientIpPolicy } from "@/lib/client-ip";
import { contentSecurityPolicy } from "@/lib/security/csp";
import { proxy } from "@/proxy";

const SIGN_IN = "http://localhost:3000/api/auth/sign-in/email";

function req(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, { method: "POST", headers });
}

/** Request headers the proxy forwards: Next encodes them as x-middleware-request-* overrides. */
function forwarded(res: Response): { overridden: string[]; value: (name: string) => string | null } {
  const overridden = (res.headers.get("x-middleware-override-headers") ?? "").split(",").filter(Boolean);
  return { overridden, value: (name) => res.headers.get(`x-middleware-request-${name}`) };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy: client IP headers on the study entry form (security-04)", () => {
  it("drops client-supplied forwarding headers on POST /study when no reverse proxy is configured", () => {
    vi.stubEnv("AUTH_TRUSTED_PROXIES", "");
    vi.stubEnv("AUTH_CLIENT_IP_HEADER", "");
    const f = forwarded(proxy(req("http://localhost:3000/study", { "x-forwarded-for": "203.0.113.9", "next-action": "abc" })));
    expect(f.overridden).toContain("next-action");
    expect(f.overridden).not.toContain("x-forwarded-for");
  });

  it("leaves GET /study and a trusted-proxy deployment untouched", () => {
    vi.stubEnv("AUTH_TRUSTED_PROXIES", "");
    vi.stubEnv("AUTH_CLIENT_IP_HEADER", "");
    expect(forwarded(proxy(new NextRequest("http://localhost:3000/study", { headers: { "x-forwarded-for": "203.0.113.9" } }))).overridden).toEqual([]);
    vi.stubEnv("AUTH_TRUSTED_PROXIES", "10.0.0.1");
    expect(forwarded(proxy(req("http://localhost:3000/study", { "x-forwarded-for": "203.0.113.9" }))).overridden).toEqual([]);
  });
});

describe("proxy: client IP headers on /api/auth", () => {
  it("drops client-supplied forwarding headers when no reverse proxy is configured", () => {
    vi.stubEnv("AUTH_TRUSTED_PROXIES", "");
    vi.stubEnv("AUTH_CLIENT_IP_HEADER", "");
    const res = proxy(req(SIGN_IN, { "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9", "content-type": "application/json" }));
    const f = forwarded(res);
    expect(f.overridden.length).toBeGreaterThan(0);
    expect(f.overridden).not.toContain("x-forwarded-for");
    expect(f.overridden).not.toContain("x-real-ip");
    expect(f.overridden).toContain("content-type");
    expect(f.value("x-forwarded-for")).toBeNull();
  });

  it("passes forwarding headers through unchanged behind a configured proxy", () => {
    vi.stubEnv("AUTH_TRUSTED_PROXIES", "10.0.0.5");
    const res = proxy(req(SIGN_IN, { "x-forwarded-for": "198.51.100.7, 10.0.0.5" }));
    expect(res.headers.get("x-middleware-override-headers")).toBeNull();
  });

  it("derives the policy from the environment at call time", () => {
    expect(clientIpPolicy({})).toEqual({ trustedProxies: [], header: "x-forwarded-for", trustForwardedHeaders: false });
    expect(clientIpPolicy({ AUTH_CLIENT_IP_HEADER: "CF-Connecting-IP" })).toMatchObject({
      header: "cf-connecting-ip",
      trustForwardedHeaders: true,
    });
  });
});

describe("Content-Security-Policy", () => {
  it("locks down scripts, plugins, base, forms and framing", () => {
    const csp = contentSecurityPolicy({ frameAncestors: "none" });
    for (const d of [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ]) {
      expect(csp).toContain(d);
    }
    expect(csp).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ frameAncestors: "self", dev: true })).toContain("'unsafe-eval'");
  });

  it("is sent on the proxy's own redirect to /sign-in", () => {
    const res = proxy(new NextRequest("http://localhost:3000/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("content-security-policy")).toContain("object-src 'none'");
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });
});

describe("media upload origin in connect-src", () => {
  it("allows only the configured S3 upload origin", async () => {
    const { mediaUploadOrigin } = await import("@/lib/security/csp");
    expect(mediaUploadOrigin({})).toBeNull();
    expect(mediaUploadOrigin({ MEDIA_S3_BUCKET: "media", MEDIA_S3_REGION: "ap-south-1" })).toBe("https://media.s3.ap-south-1.amazonaws.com");
    expect(mediaUploadOrigin({ MEDIA_S3_BUCKET: "media", MEDIA_S3_ENDPOINT: "http://localhost:9000", MEDIA_S3_FORCE_PATH_STYLE: "true" })).toBe("http://localhost:9000");
    expect(mediaUploadOrigin({ MEDIA_S3_BUCKET: "media", MEDIA_S3_ENDPOINT: "https://acc.r2.cloudflarestorage.com" })).toBe("https://media.acc.r2.cloudflarestorage.com");
    expect(contentSecurityPolicy({ frameAncestors: "none", connectSrc: ["https://media.s3.ap-south-1.amazonaws.com"] })).toContain(
      "connect-src 'self' https://media.s3.ap-south-1.amazonaws.com;",
    );
    expect(contentSecurityPolicy({ frameAncestors: "none", connectSrc: [] })).toContain("connect-src 'self';");
    // WebAssembly (KTX2 transcoder) is allowed; JS eval is not, outside dev.
    expect(contentSecurityPolicy({ frameAncestors: "none" })).toMatch(/script-src [^;]*'wasm-unsafe-eval'/);
    expect(contentSecurityPolicy({ frameAncestors: "none" })).not.toMatch(/'unsafe-eval'/);
  });
});
