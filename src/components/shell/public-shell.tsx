import Link from "next/link";
import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { institutionLines } from "@/config/institution";

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

const COLUMN = "mx-auto w-full max-w-[80rem] px-4 xs:px-6 lg:px-8";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div data-zone="public" className="flex min-h-dvh flex-col bg-vat">
      <header className="border-b border-line bg-vat">
        <div className={`${COLUMN} flex min-h-16 items-center justify-between gap-x-6 py-2`}>
          <Wordmark size="public" />
          <PublicNav links={NAV} />
        </div>
      </header>

      <main id="main" tabIndex={-1} className={`${COLUMN} flex-1 py-12 outline-none max-xs:py-8`}>
        {children}
      </main>

      <footer className="border-t border-line bg-vat">
        <div className={`${COLUMN} flex flex-col gap-6 py-8 md:flex-row md:items-start md:justify-between`}>
          <div className="flex max-w-[34rem] flex-col gap-2">
            <Wordmark size="console" />
            <p className="t-b text-lime-dim">
              A research platform for studying how people learn about craft knowledge.
            </p>
            {institutionLines().length > 0 ? (
              <dl data-slot="footer-institution" className="mt-2 flex flex-col gap-1">
                {institutionLines().map((l) => (
                  <div key={l.key} className="t-s text-lime-dim break-words">
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
                      className="inline-flex min-h-11 items-center t-label text-turmeric underline decoration-1 underline-offset-[0.2em] hover:text-turmeric-hi hover:decoration-2"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
