/**
 * Editorial shell for public pages (/, /about, /explore, /sign-in, ...). Fully static: it never
 * reads the session, so public pages prerender into the static shell.
 * Landmarks: banner (header), navigation, main#main (skip-link target), contentinfo (footer).
 */
import Link from "next/link";
import type { ReactNode } from "react";

const NAV = [
  { href: "/explore", label: "Explore" },
  { href: "/study", label: "Take part" },
  { href: "/about", label: "About" },
] as const;

const FOOTER = [
  { href: "/about", label: "About the project" },
  { href: "/privacy", label: "Privacy" },
  { href: "/accessibility", label: "Accessibility" },
] as const;

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4">
          <Link href="/" className="font-display text-2xl font-medium tracking-tight">
            Immersive Episteme
          </Link>
          <nav aria-label="Primary">
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="underline-offset-4 hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/sign-in"
                  className="rounded-md border border-input px-3 py-1.5 text-muted-foreground hover:text-foreground"
                >
                  Staff sign in
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-6 py-12 outline-none">
        {children}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>A research platform for studying how people learn about craft knowledge.</p>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {FOOTER.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="underline-offset-4 hover:underline">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
