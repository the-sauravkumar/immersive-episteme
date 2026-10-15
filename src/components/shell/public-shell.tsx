/**
 * Public shell (DESIGN.md 9.16, 11.1): /, /about, /explore, /accessibility, /privacy, /sign-in,
 * /sign-out, /forbidden. Fully static: it never reads the session, so public pages prerender into
 * the static shell.
 *
 * Header (DESIGN.md 10.1, DR-022): a 64 px --field band with the wordmark (Anek Latin 600, 22 px)
 * left; About, Explore, Accessibility, Privacy and Staff sign in as plain text links; one 1 px
 * --rule-strong line. No band pattern. Footer: colophon style on the field, with a one-line
 * project statement, links, and the Display Settings button.
 *
 * Landmarks: banner (header), navigation, main#main (skip-link target), contentinfo (footer).
 * Gutters 16 / 24 / 32 px (DESIGN.md 6), content up to 1280 px.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { institutionLines } from "@/config/institution";

import { DisplayPreferencesSync, DisplaySettings } from "./display-settings";
import { PublicNav, type PublicNavLink } from "./public-nav";

const NAV: readonly PublicNavLink[] = [
  { href: "/about", label: "About" },
  { href: "/explore", label: "Explore" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/privacy", label: "Privacy" },
  { href: "/sign-in", label: "Staff sign in" },
];

const FOOTER: readonly PublicNavLink[] = [
  { href: "/about/colophon", label: "Colophon" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/privacy", label: "Privacy" },
  { href: "/about#images-and-licences", label: "Image credits" },
];

/** The public column: 12-column grid area up to 1280 px, gutters 16/24/32 px. */
const COLUMN = "mx-auto w-full max-w-[80rem] px-4 xs:px-6 lg:px-8";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div data-zone="public" className="flex min-h-dvh flex-col bg-ground">
      <DisplayPreferencesSync zone="public" />
      <header className="border-b border-rule-strong bg-field">
        <div className={`${COLUMN} flex min-h-16 items-center justify-between gap-x-6 py-2`}>
          <Wordmark size="public" />
          <PublicNav links={NAV} />
        </div>
      </header>

      <main id="main" tabIndex={-1} className={`${COLUMN} flex-1 py-12 outline-none max-xs:py-8`}>
        {children}
      </main>

      <footer className="border-t border-rule-strong bg-field">
        <div className={`${COLUMN} flex flex-col gap-6 py-8 md:flex-row md:items-start md:justify-between`}>
          <div className="flex max-w-[34rem] flex-col gap-2">
            <Wordmark size="console" />
            <p className="text-body text-ink-2">
              A research platform for studying how people learn about craft knowledge.
            </p>
            {/* Institution lines only when configured (DESIGN.md 9.16, 13 rule 1). */}
            {institutionLines().length > 0 ? (
              <dl data-slot="footer-institution" className="mt-2 flex flex-col gap-1">
                {institutionLines().map((l) => (
                  <div key={l.key} className="text-credit break-words">
                    <dt className="inline font-semibold">{l.label}: </dt>
                    <dd className="inline">{l.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
          <div className="flex flex-col gap-4 md:items-end">
            <nav aria-label="Footer">
              <ul className="flex flex-wrap gap-x-6">
                {FOOTER.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="inline-flex min-h-11 items-center text-ui text-indigo underline decoration-1 underline-offset-[0.2em] hover:text-indigo-hover hover:decoration-2"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <DisplaySettings zone="public" />
          </div>
        </div>
      </footer>
    </div>
  );
}
