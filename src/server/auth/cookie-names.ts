const isProduction = process.env.NODE_ENV === "production";

export const hostOnly = (name: string) => (isProduction ? `__Host-${name}` : name);

export const AUTH_COOKIE_PREFIX = "ie";

export const PARTICIPANT_COOKIE = hostOnly("ie_study_session");

export const DEMO_COOKIE = hostOnly("ie_demo");

export const INVITE_COOKIE = hostOnly("ie_invite");

export const SECURE_COOKIES = isProduction;

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
