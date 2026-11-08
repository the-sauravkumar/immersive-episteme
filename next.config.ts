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
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["pg"],
  // turbopackIgnore): the migrations journal (/admin health) and the token file (/about/colophon).

  outputFileTracingIncludes: {
    "/*": ["./db/migrations/meta/_journal.json", "./content/study/*.template.json", "./src/styles/walking-tokens.css"],
  },

  images: {
    localPatterns: [{ pathname: "/figures/**", search: "" }],
    remotePatterns: [],
    minimumCacheTTL: 60,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...NO_FRAME_SOURCES.map((source) => ({ source, headers: noFraming })),
    ];
  },
};

export default nextConfig;
