/**
 * Staff console shell for /cms, /research and /admin.
 *
 * The frame (brand, landmarks) is static. Everything that depends on who is signed in (nav
 * items, area switcher, user menu) streams in behind <Suspense>, as Cache Components requires.
 * Nav filtering is cosmetic: each page enforces its own permission server-side (see
 * ConsolePage / StaffAreaGate), driven by the same table in src/lib/permissions/console-routes.ts.
 */
import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CONSOLE_AREA_LABELS,
  areaLanding,
  enterableAreas,
  visibleNav,
  type ConsoleArea,
} from "@/lib/permissions/console-routes";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import { cn } from "@/lib/utils";
import { getStaffPrincipal } from "@/server/auth/staff";

import { ConsoleNavLinks } from "./console-nav-links";
import { SignOutButton } from "./sign-out-button";

const AREA_ROOT: Record<ConsoleArea, string> = { cms: "/cms", research: "/research", admin: "/admin" };

export function ConsoleShell({ area, children }: { area: ConsoleArea; children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-border bg-secondary md:min-h-dvh md:border-r md:border-b-0">
        <div className="flex flex-col gap-1 px-4 pt-4 pb-3">
          <Link href="/" className="font-display text-xl font-medium">
            Immersive Episteme
          </Link>
          <p className="kicker">{CONSOLE_AREA_LABELS[area]} console</p>
        </div>
        <nav aria-label={`${CONSOLE_AREA_LABELS[area]} sections`} className="px-2 pb-4">
          <Suspense fallback={<NavSkeleton />}>
            <AreaNav area={area} />
          </Suspense>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-2">
          <nav aria-label="Console areas">
            <Suspense fallback={<Skeleton className="h-6 w-48" />}>
              <AreaSwitcher current={area} />
            </Suspense>
          </nav>
          <Suspense fallback={<Skeleton className="h-6 w-32" />}>
            <UserMenu />
          </Suspense>
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-6 py-8 outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-1" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

async function AreaNav({ area }: { area: ConsoleArea }) {
  const principal = await getStaffPrincipal();
  if (!principal) return null;
  const links = visibleNav(principal, area).map((r) => ({ href: r.path, label: r.label }));
  return <ConsoleNavLinks links={links} rootHref={AREA_ROOT[area]} />;
}

async function AreaSwitcher({ current }: { current: ConsoleArea }) {
  const principal = await getStaffPrincipal();
  if (!principal) return null;
  const areas = enterableAreas(principal);
  if (areas.length <= 1) return null;
  return (
    <ul className="flex flex-wrap gap-1 text-sm">
      {areas.map((a) => (
        <li key={a}>
          <Link
            href={areaLanding(principal, a) ?? AREA_ROOT[a]}
            aria-current={a === current ? "page" : undefined}
            className={cn(
              "inline-flex min-h-9 items-center rounded-md px-3 text-muted-foreground hover:bg-accent hover:text-foreground",
              a === current && "font-medium text-foreground underline underline-offset-4",
            )}
          >
            {CONSOLE_AREA_LABELS[a]}
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
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <div className="flex flex-col items-end leading-tight">
        <span className="font-medium">{principal.name}</span>
        <span className="text-xs text-muted-foreground">{principal.email}</span>
      </div>
      <ul aria-label="Your roles" className="flex flex-wrap gap-1">
        {principal.roles.map((r) => (
          <li key={r}>
            <Badge variant="outline">{ROLE_LABELS[r]}</Badge>
          </li>
        ))}
      </ul>
      <SignOutButton />
    </div>
  );
}
