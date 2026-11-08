import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Wordmark } from "@/components/brand/wordmark";
import { Skeleton } from "@/components/ui/skeleton";
import { areaLanding, enterableAreas, visibleNav, type ConsoleArea } from "@/lib/permissions/console-routes";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import { cn } from "@/lib/utils";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/config";
import { hasPasswordSignIn } from "@/server/auth/password-sign-in";
import { getStaffPrincipal } from "@/server/auth/staff";

import { ConsoleNavLinks, ConsoleNavMenu } from "./console-nav-links";
import { ConsoleUserMenu } from "./console-user-menu";

const AREA_ROOT: Record<ConsoleArea, string> = { cms: "/cms", research: "/research", admin: "/admin" };

export const CONSOLE_EYEBROW: Record<ConsoleArea, string> = {
  cms: "Content Console",
  research: "Research Console",
  admin: "Admin Console",
};

const AREA_TAB: Record<ConsoleArea, string> = { cms: "Content", research: "Research", admin: "Admin" };

export const CONSOLE_GUTTER = "px-4 xs:px-6 lg:px-8";

export function ConsoleShell({ area, children }: { area: ConsoleArea; children: ReactNode }) {
  const navLabel = `${CONSOLE_EYEBROW[area]} sections`;
  return (
    <div data-zone="console" data-console-area={area} className="min-h-dvh bg-vat md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-line bg-vat md:min-h-dvh md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-2 xs:px-6 md:flex-col md:items-start md:gap-0 md:px-4 md:pt-3 md:pb-4">
          <div className="flex min-w-0 flex-col">
            <Wordmark size="console" />
            <p className="t-s text-lime-dim">{CONSOLE_EYEBROW[area]}</p>
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
        <header className="border-b border-line">
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
              "inline-flex min-h-11 items-center border-b-4 border-transparent pt-1 t-label text-lime-dim hover:text-lime",
              a === current && "border-turmeric text-lime",
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
  return (
    <ConsoleUserMenu
      name={principal.name}
      email={principal.email}
      roles={principal.roles.map((r) => ROLE_LABELS[r])}
      hasPassword={await hasPasswordSignIn(principal.userId)}
      minPasswordLength={MIN_PASSWORD_LENGTH}
    />
  );
}
