/**
 * Final review security-01: deleting a `__Host-` cookie must send `Secure` (and `Path=/`, no
 * `Domain`), or browsers ignore the deletion and the dead participant / demo / enrolment cookie
 * stays until it expires. Next's own `cookies().delete()` sends neither, so every delete goes
 * through `expiredCookie()`; this serialises it with Next's ResponseCookies in production mode.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
// The cookie store Next uses for `cookies()` and `NextResponse.cookies`.
import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";

async function productionNames() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "production");
  return import("@/server/auth/cookie-names");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function setCookieHeader(apply: (jar: ResponseCookies) => void): string {
  const headers = new Headers();
  apply(new ResponseCookies(headers));
  return headers.get("set-cookie") ?? "";
}

describe("cookie deletion (security-01)", () => {
  it("Next's plain delete omits Secure, so a __Host- deletion would be ignored by browsers", async () => {
    const { PARTICIPANT_COOKIE } = await productionNames();
    expect(PARTICIPANT_COOKIE).toBe("__Host-ie_study_session");
    const header = setCookieHeader((jar) => jar.delete({ name: PARTICIPANT_COOKIE, path: "/" }));
    expect(header).not.toMatch(/Secure/);
  });

  it("expiredCookie() deletes every __Host- cookie with Secure, Path=/ and no Domain", async () => {
    const names = await productionNames();
    const enrolment = names.hostOnly("ie_study_enrolment");
    for (const name of [names.PARTICIPANT_COOKIE, names.DEMO_COOKIE, enrolment]) {
      expect(name.startsWith("__Host-")).toBe(true);
      const header = setCookieHeader((jar) => jar.set(names.expiredCookie(name)));
      expect(header).toContain(`${name}=;`);
      expect(header).toMatch(/; Secure/);
      expect(header).toMatch(/; Path=\//);
      expect(header).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
      expect(header).not.toMatch(/Domain=/i);
    }
  });

  it("development keeps plain names and no Secure (plain-http localhost)", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    const names = await import("@/server/auth/cookie-names");
    expect(names.PARTICIPANT_COOKIE).toBe("ie_study_session");
    const header = setCookieHeader((jar) => jar.set(names.expiredCookie(names.PARTICIPANT_COOKIE)));
    expect(header).not.toMatch(/Secure/);
  });
});
