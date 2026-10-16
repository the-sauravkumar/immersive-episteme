/**
 * Cookie names shared by the proxy (cheap presence checks), the guards and the issuers.
 * No secrets, no server-only import: src/proxy.ts imports this.
 *
 * In production the `__Host-` prefix pins cookies to this exact origin over HTTPS with
 * `Path=/` and no `Domain` (browsers reject them otherwise). Development keeps plain names
 * because `__Host-` requires `Secure`, which plain-http localhost does not satisfy everywhere.
 */
const isProduction = process.env.NODE_ENV === "production";

/** The `__Host-` name in production, the plain name in development (one rule for every cookie we issue). */
export const hostOnly = (name: string) => (isProduction ? `__Host-${name}` : name);

/** Better Auth cookie prefix (its own names become `<prefix>.session_token`, ...). */
export const AUTH_COOKIE_PREFIX = "ie";

/** Signed participant study-session cookie (pseudonymous; never a Better Auth account). */
export const PARTICIPANT_COOKIE = hostOnly("ie_study_session");

/** Signed public-demo cookie (non-experimental exploration started from /explore). */
export const DEMO_COOKIE = hostOnly("ie_demo");

export const SECURE_COOKIES = isProduction;

/**
 * The Set-Cookie options that DELETE one of our cookies. Use instead of `cookies().delete(...)`:
 * Next's delete only sends `Path` and an expired date, and browsers ignore a `__Host-` Set-Cookie
 * without `Secure` (RFC 6265bis, cookie name prefixes), so in production the old cookie would
 * stay until it expires (final review security-01). The attributes match those it was set with.
 */
export function expiredCookie(name: string) {
  return {
    name,
    value: "",
    path: "/",
    secure: SECURE_COOKIES,
    httpOnly: true,
    sameSite: "lax" as const,
    maxAge: 0,
    expires: new Date(0),
  };
}
