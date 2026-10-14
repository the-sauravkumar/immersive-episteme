/**
 * Cookie names shared by the proxy (cheap presence checks), the guards and the issuers.
 * No secrets, no server-only import: src/proxy.ts imports this.
 *
 * In production the `__Host-` prefix pins cookies to this exact origin over HTTPS with
 * `Path=/` and no `Domain` (browsers reject them otherwise). Development keeps plain names
 * because `__Host-` requires `Secure`, which plain-http localhost does not satisfy everywhere.
 */
const isProduction = process.env.NODE_ENV === "production";

const hostOnly = (name: string) => (isProduction ? `__Host-${name}` : name);

/** Better Auth cookie prefix (its own names become `<prefix>.session_token`, ...). */
export const AUTH_COOKIE_PREFIX = "ie";

/** Signed participant study-session cookie (pseudonymous; never a Better Auth account). */
export const PARTICIPANT_COOKIE = hostOnly("ie_study_session");

/** Signed public-demo cookie (non-experimental exploration started from /explore). */
export const DEMO_COOKIE = hostOnly("ie_demo");

export const SECURE_COOKIES = isProduction;
