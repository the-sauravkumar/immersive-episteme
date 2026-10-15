/**
 * Staff console shell for /cms, /research and /admin (DESIGN.md 9.16).
 *
 *  - A 15rem left rail on `--field` (navigation plane, DR-022) with a 1 px --rule-strong right
 *    edge: the wordmark (Atkinson 800, 18 px), the area name as plain `text-h3` ("Research
 *    Console", "Content Console", "Admin Console"; not an eyebrow) and 44 px nav links (active:
 *    ink 700 on --wash with `aria-current`, no left bar). Under 768 px the rail becomes a top
 *    strip and the links fold into a "Sections" sheet.
 *  - A 56 px top bar on paper with ONE 1 px --rule-strong line: the area switcher as underline
 *    tabs and the user menu (name, role badges, Display Settings, sign out).
 *  - No band and no second rule above the PageHeader (DR-022).
 *
 * The frame (brand, landmarks) is static. Everything that depends on who is signed in (nav
 * items, area switcher, user menu) streams in behind <Suspense>, as Cache Components requires.
 * Nav filtering is cosmetic: each page enforces its own permission server-side (see
 * ConsolePage / StaffAreaGate), driven by the same table in src/lib/permissions/console-routes.ts.
 */
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { areaLanding, enterableAreas, visibleNav, type ConsoleArea } from "@/lib/permissions/console-routes";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import { cn } from "@/lib/utils";
import { getStaffPrincipal } from "@/server/auth/staff";

import { ConsoleNavLinks, ConsoleNavMenu } from "./console-nav-links";
import { ConsoleUserMenu } from "./console-user-menu";
import { DisplayPreferencesSync } from "./display-settings";

const AREA_ROOT: Record<ConsoleArea, string> = { cms: "/cms", research: "/research", admin: "/admin" };

/** The area name in the rail (DESIGN.md 10.2). */
export const CONSOLE_EYEBROW: Record<ConsoleArea, string> = {
  cms: "Content Console",
  research: "Research Console",
  admin: "Admin Console",
};

/** Short labels for the area switcher tabs. */
const AREA_TAB: Record<ConsoleArea, string> = { cms: "Content", research: "Research", admin: "Admin" };

/** Console gutters (DESIGN.md 6): 16 / 24 / 32 px. PageHeader's band bleed mirrors these. */
export const CONSOLE_GUTTER = "px-4 xs:px-6 lg:px-8";

export function ConsoleShell({ area, children }: { area: ConsoleArea; children: ReactNode }) {
  const navLabel = `${CONSOLE_EYEBROW[area]} sections`;
  return (
    <div data-zone="console" data-console-area={area} className="min-h-dvh bg-ground md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <DisplayPreferencesSync zone="console" />
      <aside className="border-b border-rule-strong bg-field md:min-h-dvh md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-2 xs:px-6 md:flex-col md:items-start md:gap-0 md:px-4 md:pt-3 md:pb-4">
          <div className="flex min-w-0 flex-col">
            <Wordmark size="console" />
            <p className="text-h3 text-ink-2">{CONSOLE_EYEBROW[area]}</p>
          </div>
          <div className="md:hidden">
            <Suspense fallback={null}>
              <AreaNavMenu area={area} label={navLabel} />
            </Suspense>
          </div>
        </div>
        <nav aria-label={navLabel} className="hidden pb-6 md:block">
          <Suspense fallback={<NavSkeleton />}>
            <AreaNav area={area} />
          </Suspense>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="border-b border-rule-strong">
          <div className={cn("flex min-h-14 flex-wrap items-center justify-between gap-x-4", CONSOLE_GUTTER)}>
            <nav aria-label="Console areas" className="min-w-0">
              <Suspense fallback={<Skeleton className="h-6 w-48" />}>
                <AreaSwitcher current={area} />
              </Suspense>
            </nav>
            <Suspense fallback={<Skeleton className="h-6 w-32" />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <main id="main" tabIndex={-1} className={cn("w-full max-w-[90rem] flex-1 py-8 outline-none", CONSOLE_GUTTER)}>
          {children}
        </main>
      </div>
    </div>
  );
}

function NavSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

async function navLinks(area: ConsoleArea) {
  const principal = await getStaffPrincipal();
  if (!principal) return null;
  return visibleNav(principal, area).map((r) => ({ href: r.path, label: r.label }));
}

async function AreaNav({ area }: { area: ConsoleArea }) {
  const links = await navLinks(area);
  if (!links) return null;
  return <ConsoleNavLinks links={links} rootHref={AREA_ROOT[area]} />;
}

async function AreaNavMenu({ area, label }: { area: ConsoleArea; label: string }) {
  const links = await navLinks(area);
  if (!links) return null;
  return <ConsoleNavMenu links={links} rootHref={AREA_ROOT[area]} label={label} />;
}

/** Underline tabs (DESIGN.md 9.4 style): 44 px, inactive ink-2, active ink 700 with a 3 px indigo bottom bar. */
async function AreaSwitcher({ current }: { current: ConsoleArea }) {
  const principal = await getStaffPrincipal();
  if (!principal) return null;
  const areas = enterableAreas(principal);
  if (areas.length <= 1) return null;
  return (
    <ul className="flex flex-wrap gap-x-4">
      {areas.map((a) => (
        <li key={a}>
          <Link
            href={areaLanding(principal, a) ?? AREA_ROOT[a]}
            aria-current={a === current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center border-b-[3px] border-transparent pt-[3px] text-ui text-ink-2 hover:text-ink",
              a === current && "border-indigo font-bold text-ink",
            )}
          >
            {AREA_TAB[a]}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function UserMenu() {
  const principal = await getStaffPrincipal();
  if (!principal) return null;
  return <ConsoleUserMenu name={principal.name} email={principal.email} roles={principal.roles.map((r) => ROLE_LABELS[r])} />;
}
