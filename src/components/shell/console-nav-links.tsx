"use client";

import { PanelLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string };

function isActive(pathname: string, href: string, isRoot: boolean): boolean {
  if (isRoot) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/*
 * Console rail links (DESIGN.md 9.16): 44 px rows; the active link is --ink at weight 600 with
 * a 3 px indigo left rule and aria-current. No card, no shadow, no pill.
 */
const ROW =
  "flex min-h-11 items-center border-l-[3px] border-transparent py-2 pr-3 pl-[13px] text-ui text-ink-2 hover:text-ink hover:underline hover:decoration-1 hover:underline-offset-4";
const ACTIVE = "border-indigo font-semibold text-ink";

function LinkList({ links, rootHref, onNavigate }: { links: NavLink[]; rootHref: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col">
      {links.map((link) => {
        const active = isActive(pathname, link.href, link.href === rootHref);
        return (
          <li key={link.href}>
            <Link href={link.href} aria-current={active ? "page" : undefined} onClick={onNavigate} className={cn(ROW, active && ACTIVE)}>
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The rail list from 768 px. Items arrive pre-filtered by permission from the server. */
export function ConsoleNavLinks({ links, rootHref }: { links: NavLink[]; rootHref: string }) {
  return <LinkList links={links} rootHref={rootHref} />;
}

/** Under 768 px the rail folds into a 44 px "Sections" button that opens the same list in a sheet. */
export function ConsoleNavMenu({ links, rootHref, label }: { links: NavLink[]; rootHref: string; label: string }) {
  const [open, setOpen] = useState(false);
  if (links.length === 0) return null;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="px-4">
          <PanelLeft aria-hidden="true" />
          Sections
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>{label}</SheetTitle>
          <SheetDescription className="sr-only">Pages of this console area.</SheetDescription>
        </SheetHeader>
        <nav aria-label={label} className="pb-6">
          <LinkList links={links} rootHref={rootHref} onNavigate={() => setOpen(false)} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}
