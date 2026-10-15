import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";

import { Providers } from "@/components/providers";
import { DISPLAY_BOOT_SCRIPT } from "@/components/shell/display-preferences";

import "./globals.css";

/*
 * Fonts (DESIGN.md 5.1): two variable files, self-hosted by next/font at build time (R-T10), so
 * the CSP (`font-src 'self' data:`) is unchanged and no request goes to Google.
 *  - Source Serif 4 (variable wght + opsz, roman only): titles, headings, the verbatim quote.
 *  - Inter (variable wght, roman only): claims, UI, tables, source lines.
 * No italic file, no small caps and no old-style figures (the served Source Serif 4 file lacks
 * onum, lnum and smcp, R-T8). The CSS variable names differ from the Tailwind theme keys
 * (`--font-serif`, `--font-sans`) so the theme can wrap them in fallback stacks without a
 * self-reference; see globals.css `--serif-stack` and `--sans-stack`.
 */
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal"],
  display: "swap",
  variable: "--font-source-serif",
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Immersive Episteme",
    template: "%s · Immersive Episteme",
  },
  description: "A research platform for studying how people learn about craft knowledge.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#F5F1E8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${inter.variable}`} suppressHydrationWarning>
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
