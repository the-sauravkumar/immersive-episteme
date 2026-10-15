import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";

import { Providers } from "@/components/providers";
import { DISPLAY_BOOT_SCRIPT } from "@/components/shell/display-preferences";

import "./globals.css";

/*
 * Fonts (DESIGN.md 5.1, DR-022): ONE variable file on study, console and every text role,
 * self-hosted by next/font at build time (R-T10), so the CSP (`font-src 'self' data:`) is
 * unchanged and no request goes to Google.
 *  - Atkinson Hyperlegible Next (OFL; variable wght 200 to 800, upright only): titles, headings,
 *    claims, the verbatim quote, UI, tables, IDs. Latin-ext loads through unicode-range only.
 *  - Anek Latin (public display only) is loaded by src/app/(public)/layout.tsx, never here, so
 *    study and console preload exactly one font file.
 * No italic file, no serif, no small caps and no old-style figures (R-T8). The CSS variable name
 * differs from the Tailwind theme key (`--font-sans`) so the theme can wrap it in a fallback stack
 * without a self-reference; see globals.css `--sans-stack`.
 */
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  style: ["normal"],
  display: "swap",
  variable: "--font-atkinson",
});

export const metadata: Metadata = {
  title: {
    default: "Immersive Episteme",
    template: "%s | Immersive Episteme",
  },
  description: "A research platform for studying how people learn about craft knowledge.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={atkinson.variable} suppressHydrationWarning>
      <head>
        {/* Pre-paint display classes (DESIGN.md 4.5, 9.19; DR-019): stored high contrast and reduce
            motion, and light forced on study routes, before first paint on a hard load. Static
            string, no request data, so it is safe under cacheComponents. */}
        <script dangerouslySetInnerHTML={{ __html: DISPLAY_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        {/* Skip link (DESIGN.md 9.14): a 44 px primary control when focused, above all chrome.
            On learning routes the StudyBar carries the one skip link of the view (P22), so this
            one is hidden there by globals.css (.root-skip-link). */}
        <a
          href="#main"
          className="root-skip-link text-ui sr-only z-(--z-skip-link) rounded-control bg-indigo text-on-indigo focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:inline-flex focus:min-h-11 focus:items-center focus:px-5"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
