/**
 * Breadcrumb trail of the 2D index, tradition, category, comparison and search pages (DESIGN.md
 * 9.16): the shared `BreadcrumbTrail` (one line, middle crumbs collapsed behind a 44 px "…",
 * "← Parent" only under 520 px) with tracked links, so a crumb move is logged as navigation.
 * Concept pages have none (DESIGN.md 6); their way up is the StudyBar's "Up to <parent>".
 * Labels are page titles, so they are title-cased like the headings they lead to.
 */
import { BreadcrumbTrail } from "@/components/ui/breadcrumb";
import { titleCase } from "@/lib/text/title-case";

import { TrackedLink } from "./tracked-link";

export interface Crumb {
  label: string;
  href?: string;
}

export function Crumbs({ items }: { items: readonly Crumb[] }) {
  return <BreadcrumbTrail items={items.map((c) => ({ label: titleCase(c.label), href: c.href }))} linkComponent={TrackedLink} className="mb-4" />;
}
