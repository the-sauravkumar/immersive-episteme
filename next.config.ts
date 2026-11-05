// Security headers adapted from virtual-walkthrough next.config.ts.
// Differences: camera=() (no WebXR AR passthrough — the immersive condition never needs the
// camera), a full Content-Security-Policy (src/lib/security/csp.ts; why it has no nonce is
// explained there), and frame-ancestors 'none' on every staff surface (/admin, /research,
// /cms) and the sign-in pages.
import type { NextConfig } from "next";

import { contentSecurityPolicy } from "./src/lib/security/csp";

const dev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy({ frameAncestors: "self", dev }) },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    // xr-spatial-tracking stays self-only for optional WebXR VR viewing; no camera/mic/geo.
    value:
      "camera=(), microphone=(), geolocation=(), xr-spatial-tracking=(self), payment=(), usb=(), interest-cohort=()",
  },
];

const noFraming = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy({ frameAncestors: "none", dev }) },
];

const NO_FRAME_SOURCES = [
  "/admin",
  "/admin/:path*",
  "/research",
  "/research/:path*",
  "/cms",
  "/cms/:path*",
  "/sign-in",
  "/sign-out",
  "/forbidden",
  "/awaiting-access",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next 16 defaults (create-next-app 16.4): Cache Components + Partial Prefetching.
  // Request-time reads (cookies(), headers(), session) must sit behind <Suspense>.
  // See node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md
  cacheComponents: true,
  partialPrefetching: true,
  // Server-only native-ish packages that must not be bundled.
  serverExternalPackages: ["pg"],
  // Data files read at run time from paths the build cannot trace (their reads are marked
  // turbopackIgnore): the migrations journal (/admin health).

  outputFileTracingIncludes: {
    "/*": ["./db/migrations/meta/_journal.json", "./content/study/*.template.json"],
  },
  turbopack: {
    // src/app/layout.tsx sets adjustFontFallback: false for Atkinson Hyperlegible Next (Next.js has
    // no fallback metrics for it), but Turbopack still looks the metrics up and reports the miss.
    // Only that exact notice is filtered; any other font issue still shows.
    ignoreIssue: [{ path: /.*/, title: /^Failed to find font override values for font `Atkinson Hyperlegible Next`/ }],
  },
  /*
   * Image optimiser (source change S6; docs/deploy/RESEARCH.md s12). KnowledgeFigure renders every
   * figure `unoptimized`, so the browser fetches /figures/<id> itself and the licence gate of that
   * route runs on every request; the optimiser keeps its own copy (on Vercel up to 31 days, across
   * redeploys) and could outlive a withdrawal or a licence end. Lock it down anyway, so a future
   * <Image> without `unoptimized` cannot turn arbitrary local paths or query strings into cached
   * transforms: only /figures/<id> without a query, and the shortest cache the docs recommend.
   */
  images: {
    localPatterns: [{ pathname: "/figures/**", search: "" }],
    remotePatterns: [],
    minimumCacheTTL: 60,
  },
  async headers() {
    // Later entries override earlier ones for the same header key, so each response carries
    // exactly one CSP.
    return [
      { source: "/:path*", headers: securityHeaders },
      ...NO_FRAME_SOURCES.map((source) => ({ source, headers: noFraming })),
    ];
  },
};

export default nextConfig;
