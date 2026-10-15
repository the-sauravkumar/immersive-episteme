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
 *  - scripts only from this origin (no third-party script hosts, no `eval` outside dev;
 *    WebAssembly compilation is allowed for the museum's texture transcoder);
 *  - no plugins (`object-src 'none'`), no `<base>` hijacking (`base-uri 'none'`);
 *  - forms post only to this origin (`form-action 'self'`), so injected markup cannot send
 *    credentials elsewhere; fetch/XHR/WebSocket only to this origin (`connect-src 'self'`),
 *    which limits exfiltration of curator or participant data;
 *  - images/media/3D assets from this origin plus `blob:`/`data:` (WebGL textures, previews);
 *  - framing per surface (`frame-ancestors`).
 * Hash-based CSP (experimental `sri`) is the route to dropping `'unsafe-inline'` later. Any new
 * media/CDN origin must be added here explicitly. The one exception is the S3 media bucket:
 * curators' browsers PUT uploads straight to it (presigned URLs, src/server/cms/media/storage.ts),
 * so its origin is added to `connect-src` when MEDIA_S3_BUCKET is set.
 */

export type FrameAncestors = "self" | "none";

export type CspOptions = {
  frameAncestors: FrameAncestors;
  /** Development needs 'unsafe-eval' (React error overlays). */
  dev?: boolean;
  /** Extra fetch/XHR origins. Defaults to the S3 media upload origin from the environment. */
  connectSrc?: string[];
};

type EnvSource = Record<string, string | undefined>;

/**
 * Origin the browser uploads media to in S3 mode, mirroring how the AWS SDK builds presigned
 * URLs: a custom endpoint (MinIO, R2…) is used as is with path-style addressing, or with the
 * bucket as a sub-domain otherwise; plain AWS uses `<bucket>.s3.<region>.amazonaws.com`.
 * Null in local-disk mode or when the variables are malformed (the media library rejects them).
 */
export function mediaUploadOrigin(env: EnvSource = process.env): string | null {
  const bucket = env.MEDIA_S3_BUCKET?.trim();
  if (!bucket) return null;
  const endpoint = env.MEDIA_S3_ENDPOINT?.trim();
  const pathStyle = env.MEDIA_S3_FORCE_PATH_STYLE?.trim() === "true";
  try {
    if (endpoint) {
      const u = new URL(endpoint);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      return pathStyle ? u.origin : `${u.protocol}//${bucket}.${u.host}`;
    }
    const region = env.MEDIA_S3_REGION?.trim() || "us-east-1";
    if (!/^[a-z0-9-]+$/.test(region) || !/^[a-z0-9.-]+$/.test(bucket)) return null;
    return pathStyle ? `https://s3.${region}.amazonaws.com` : `https://${bucket}.s3.${region}.amazonaws.com`;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy({ frameAncestors, dev = false, connectSrc }: CspOptions): string {
  const extraConnect = connectSrc ?? [mediaUploadOrigin()].filter((o): o is string => o !== null);
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    // 'wasm-unsafe-eval' allows WebAssembly compilation only (not JS eval): the museum's KTX2
    // texture transcoder (public/museum/basis) is WebAssembly.
    ["script-src", "'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : [])],
    ["style-src", "'self'", "'unsafe-inline'"],
    ["img-src", "'self'", "blob:", "data:"],
    ["font-src", "'self'", "data:"],
    ["media-src", "'self'", "blob:"],
    ["connect-src", "'self'", ...extraConnect],
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
