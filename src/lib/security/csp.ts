/**
 * Content-Security-Policy for every response (next.config.ts headers, and src/proxy.ts for the
 * responses it creates itself). Dependency-free: imported by next.config.ts and the proxy.
 *
 * Why no nonce: Next.js applies nonces only to dynamically rendered HTML, and its CSP guide
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Static vs Dynamic
 * Rendering with CSP") states that Partial Prerendering is incompatible with nonce-based CSP,
 * because the prerendered static shell's scripts cannot carry a per-request nonce. This app
 * runs with `cacheComponents` (static shells) by design (docs/decisions/0001), so a
 * `'nonce-…' 'strict-dynamic'` policy would block the framework's own shell scripts. Inline
 * scripts are therefore still allowed (`'unsafe-inline'`), and everything else is locked down:
 *  - scripts only from this origin (no third-party script hosts, no `eval` outside dev);
 *  - no plugins (`object-src 'none'`), no `<base>` hijacking (`base-uri 'none'`);
 *  - forms post only to this origin (`form-action 'self'`), so injected markup cannot send
 *    credentials elsewhere; fetch/XHR/WebSocket only to this origin (`connect-src 'self'`),
 *    which limits exfiltration of curator or participant data;
 *  - images/media/3D assets from this origin plus `blob:`/`data:` (WebGL textures, previews);
 *  - framing per surface (`frame-ancestors`).
 * Hash-based CSP (experimental `sri`) is the route to dropping `'unsafe-inline'` later. Any new
 * media/CDN origin must be added here explicitly.
 */

export type FrameAncestors = "self" | "none";

export type CspOptions = {
  frameAncestors: FrameAncestors;
  /** Development needs 'unsafe-eval' (React error overlays). */
  dev?: boolean;
};

export function contentSecurityPolicy({ frameAncestors, dev = false }: CspOptions): string {
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:"],
    ["font-src", "'self'", "data:"],
    ["media-src", "'self'", "blob:"],
    ["connect-src", "'self'"],
    ["worker-src", "'self'", "blob:"],
    ["manifest-src", "'self'"],
    ["frame-src", "'none'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'self'"],
    ["frame-ancestors", `'${frameAncestors}'`],
  ];
  // No upgrade-insecure-requests: HSTS already pins HTTPS in production, and the directive
  // would break `next start` on plain-http localhost (e2e).
  return directives.map((d) => d.join(" ")).join("; ");
}

export const isDevBuild = () => process.env.NODE_ENV === "development";
