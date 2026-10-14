import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const cormorant = Cormorant_Garamond({
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-cormorant",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
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
  themeColor: "#efe9df",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${cormorant.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-(--z-skip-link) rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
