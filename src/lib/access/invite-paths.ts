/**
 * Invite gate paths (deployment source change S11). Pure and client-safe: src/proxy.ts, the
 * /invite page, the redeem route and the server-side check share one definition of what the gate
 * covers. The contract is docs/deploy/RUNBOOK.md "Invite-only access" (scripts/deploy/smoke.ts
 * tests it on a deployment).
 */
import { safeNextPath } from "@/lib/permissions/safe-redirect";

/** The page where a visitor without an invite lands. */
export const INVITE_PATH = "/invite";
/** Query parameter that redeems a code on any URL: `/?invite=<code>`, `/study?code=x&invite=<code>`. */
export const INVITE_PARAM = "invite";
/** Route handler that redeems a code from a URL (the proxy rewrites `?invite=` requests to it). */
export const INVITE_REDEEM_PATH = "/invite/redeem";
/**
 * Request headers the proxy sets on its rewrite to the redeem route (DR-067). A proxy rewrite keeps
 * the ORIGINAL query string, so the redeem route cannot read the rewrite URL's `code` and `next`:
 * on `/study?code=<slug>&invite=<code>` it read the study slug as the invite code and refused it,
 * and on every link it lost the target page. The values are URI-encoded (headers are ASCII only).
 */
export const INVITE_REDEEM_CODE_HEADER = "x-invite-redeem-code";
export const INVITE_REDEEM_NEXT_HEADER = "x-invite-redeem-next";

/**
 * Reachable without an invite. Staff areas (/cms, /research, /admin) are not listed: the proxy
 * sends them to /sign-in before the invite gate, so staff never need a code. Every other /api
 * route refuses callers without a participant, demo or staff session on its own (401/403), and
 * those sessions are only issued behind the gate.
 */
const EXEMPT_PREFIXES = ["/invite", "/sign-in", "/sign-out", "/forbidden", "/console", "/api", "/_next", "/museum"] as const;
const EXEMPT_FILES = new Set(["/favicon.ico", "/robots.txt"]);

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isInviteExemptPath(pathname: string): boolean {
  return EXEMPT_FILES.has(pathname) || EXEMPT_PREFIXES.some((p) => underPrefix(pathname, p));
}

/** Where to go after a successful redemption: a same-origin path, never back to /invite. */
export function inviteNextPath(value: unknown): string {
  const next = safeNextPath(value, "/");
  const path = next.split(/[?#]/, 1)[0] ?? "/";
  return underPrefix(path, INVITE_PATH) ? "/" : next;
}

/** The invite page, remembering where the visitor was going (`next`), and optionally why. */
export function invitePath(next?: string, error?: "invalid"): string {
  const params = new URLSearchParams();
  const target = next === undefined ? "/" : inviteNextPath(next);
  if (target !== "/") params.set("next", target);
  if (error) params.set("error", error);
  const qs = params.toString();
  return qs ? `${INVITE_PATH}?${qs}` : INVITE_PATH;
}

/** Path and query of `url` without the invite parameter (the code must not stay in the address bar or history). */
export function withoutInviteParam(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete(INVITE_PARAM);
  const qs = params.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}`;
}
