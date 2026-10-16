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

/**
 * The KTX2 transcoder's bootstrap worker (src/components/museum/three/ktx2-worker.ts): a dedicated
 * worker takes the policy delivered with its own script, so only this worker may evaluate code (the
 * transcoder's embind glue uses `new Function`). It fetches nothing and loads no other script.
 */
const transcoderWorker = [
  { key: "Content-Security-Policy", value: "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'" },
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
  async headers() {
    // Later entries override earlier ones for the same header key, so each response carries
    // exactly one CSP.
    return [
      { source: "/:path*", headers: securityHeaders },
      ...NO_FRAME_SOURCES.map((source) => ({ source, headers: noFraming })),
      { source: "/museum/basis/ktx2-worker-boot.js", headers: transcoderWorker },
    ];
  },
};

export default nextConfig;
