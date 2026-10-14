"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string };

function isActive(pathname: string, href: string, isRoot: boolean): boolean {
  if (isRoot) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sidebar links with aria-current. Items arrive pre-filtered by permission from the server. */
export function ConsoleNavLinks({ links, rootHref }: { links: NavLink[]; rootHref: string }) {
  const pathname = usePathname();
  return (
    <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {links.map((link) => {
        const active = isActive(pathname, link.href, link.href === rootHref);
        return (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-foreground",
                active && "bg-card font-medium text-foreground shadow-card",
              )}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
