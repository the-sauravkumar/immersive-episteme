import type { Metadata, Viewport } from "next";

import { Providers } from "@/components/providers";

import "./globals.css";

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
  themeColor: "#0E1626",
  colorScheme: "dark",
};

const FONT_FILES = ["/walkthrough/fonts/Eczar-400-800.woff2", "/walkthrough/fonts/Mukta-400.woff2"] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        {FONT_FILES.map((href) => (
          <link key={href} rel="preload" href={href} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="root-skip-link t-label sr-only z-(--z-skip-link) bg-turmeric text-vat focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:inline-flex focus:min-h-11 focus:items-center focus:px-5"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
