"use client";

/**
 * Public header navigation (DESIGN.md 10.1): plain text links in Atkinson 16/600 with 44 px hit
 * areas; the current page is underlined 2 px indigo and carries `aria-current="page"`. From
 * 768 px the links sit in the header; under 768 px they fold into a 44 px "Menu" button that
 * opens a sheet with the same links in the same order.
 */
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type PublicNavLink = { readonly href: string; readonly label: string };

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

const LINK =
  "inline-flex min-h-11 min-w-11 items-center text-ui text-ink underline-offset-[6px] decoration-indigo hover:underline hover:decoration-1";
const CURRENT = "underline decoration-2 hover:decoration-2";

export function PublicNav({ links }: { links: readonly PublicNavLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label="Primary" className="hidden md:block">
        <ul className="flex items-center gap-x-6">
          {links.map((link) => {
            const current = isCurrent(pathname, link.href);
            return (
              <li key={link.href}>
                <Link href={link.href} aria-current={current ? "page" : undefined} className={cn(LINK, current && CURRENT)}>
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="ghost" className="-mr-3 px-3 md:hidden">
            <Menu aria-hidden="true" />
            Menu
          </Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription className="sr-only">Pages of the Immersive Episteme site.</SheetDescription>
          </SheetHeader>
          <nav aria-label="Primary" className="px-6 max-xs:px-4">
            <ul className="flex flex-col border-t border-rule">
              {links.map((link) => {
                const current = isCurrent(pathname, link.href);
                return (
                  <li key={link.href} className="border-b border-rule">
                    <Link
                      href={link.href}
                      aria-current={current ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={cn(LINK, "flex w-full", current && CURRENT)}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
