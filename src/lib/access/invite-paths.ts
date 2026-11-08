import { safeNextPath } from "@/lib/permissions/safe-redirect";

export const INVITE_PATH = "/invite";
export const INVITE_PARAM = "invite";

const EXEMPT_PREFIXES = ["/invite", "/sign-in", "/sign-out", "/forbidden", "/awaiting-access", "/console", "/api", "/_next", "/about", "/accessibility", "/privacy", "/walkthrough/fonts"] as const;
const EXEMPT_FILES = new Set(["/favicon.ico", "/robots.txt", "/walkthrough/course/plaster.jpg"]);

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isInviteExemptPath(pathname: string): boolean {
  return EXEMPT_FILES.has(pathname) || EXEMPT_PREFIXES.some((p) => underPrefix(pathname, p));
}

export function gatedLinkPrefetch(href: string): false | undefined {
  return isInviteExemptPath(href.split(/[?#]/, 1)[0] ?? "/") ? undefined : false;
}

export function inviteNextPath(value: unknown): string {
  const next = safeNextPath(value, "/");
  const path = next.split(/[?#]/, 1)[0] ?? "/";
  return underPrefix(path, INVITE_PATH) ? "/" : next;
}

export function invitePath(next?: string, error?: "invalid", code?: string): string {
  const params = new URLSearchParams();
  const target = next === undefined ? "/" : inviteNextPath(next);
  if (target !== "/") params.set("next", target);
  if (error) params.set("error", error);
  if (code) params.set("code", code);
  const qs = params.toString();
  return qs ? `${INVITE_PATH}?${qs}` : INVITE_PATH;
}

export function withoutInviteParam(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete(INVITE_PARAM);
  const qs = params.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}`;
}
