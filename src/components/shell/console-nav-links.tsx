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

const ROW =
  "flex min-h-11 items-center px-4 py-2 t-label text-lime-dim hover:bg-raised-hover hover:text-lime";
const ACTIVE = "bg-vat-2 text-turmeric";

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

export function ConsoleNavLinks({ links, rootHref }: { links: NavLink[]; rootHref: string }) {
  return <LinkList links={links} rootHref={rootHref} />;
}

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
