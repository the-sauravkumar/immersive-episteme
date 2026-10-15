import { Check } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Mono } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Skeleton } from "@/components/ui/skeleton";
import { roleGrants } from "@/lib/permissions/matrix";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import { ROLES, ROLE_LABELS, isStaffRole } from "@/lib/permissions/roles";
import { titleCase } from "@/lib/text/title-case";
import { roleHolderCounts } from "@/server/admin/users";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Roles" };

/** Policy rules encoded in the matrix (docs/architecture/foundation.md §2). */
const POLICY = [
  "Separation of duties on content: content editors draft and edit, but never review, verify or publish. Verification and publication belong to curators and the principal investigator, and nobody verifies content they authored.",
  "The platform administrator is an operator: users, roles, settings, audit log and read access. It cannot verify or publish content, run studies, or see identifying participant data. A person who needs both holds two roles.",
  "The research analyst is read-only and pseudonymised: no participant identification, no identified exports, no write permissions.",
  "Only the principal investigator activates studies, excludes sessions and creates identified exports.",
  "Every staff role may preview both learning conditions; such access is always flagged non-experimental.",
  "Participant and public are never stored: they come from a signed study-session cookie and from the absence of any credential.",
];

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page() {
  return (
    <ConsolePage
      path="/admin/roles"
      title="Roles"
      description="The role × permission matrix (src/lib/permissions/matrix.ts) and who holds each role. Roles are assigned on the Users page."
    >
      <div className="flex flex-col gap-12">
        <section aria-labelledby="policy" className="flex max-w-[40rem] flex-col gap-3">
          <h2 id="policy" className="text-h2 text-ink">
            {titleCase("policy")}
          </h2>
          <ol className="text-body flex list-decimal flex-col gap-2 pl-6 text-ink marker:text-ink-3 marker:tabular-nums">
            {POLICY.map((p) => (
              <li key={p} className="pl-1">
                {p}
              </li>
            ))}
          </ol>
        </section>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <Matrix />
        </Suspense>
      </div>
    </ConsolePage>
  );
}

/*
 * Permission matrix (DESIGN.md 9.3, 11.11): booktabs rules, a check glyph plus visually hidden
 * "Yes"/"No" in each cell, a sticky header row and a sticky first column. The table scrolls inside
 * its own labelled region in both directions (capped to the viewport height), because a sticky
 * header only sticks within its nearest scroll container; so this does not use the Table
 * primitive's horizontal-only container, but keeps its booktabs styling (1.5 px ink top and
 * bottom rules, 1 px ink midrule, 1 px rule between rows, no vertical rules, no zebra).
 * Sticky cells carry an opaque --ground fill so rows never show through.
 */
const HEAD = "text-dl-label sticky top-0 z-10 h-11 border-b border-b-ink bg-ground px-2 pb-2 align-bottom";
const ROW_HEAD = "sticky left-0 z-[5] bg-ground py-2 pr-3 pl-0 text-left align-middle font-normal";

async function Matrix() {
  const actor = await requirePermission("admin.roles");
  const holders = await roleHolderCounts(getPool(), actor);
  return <MatrixTable holders={holders} />;
}

function MatrixTable({ holders }: { holders: Awaited<ReturnType<typeof roleHolderCounts>> }) {
  const captionId = "matrix-caption";
  return (
    <section aria-labelledby="matrix" className="flex min-w-0 flex-col gap-3">
      <h2 id="matrix" className="text-h2 text-ink">
        {titleCase("permission matrix")}
      </h2>
      <p className="text-body max-w-[40rem] text-ink-2">
        A check means the role holds the permission; a dash means it does not. Holder counts exclude locked accounts. Participant and public are never stored, so they have no
        holders.
      </p>
      <p id={captionId} className="font-sans text-[0.9375rem] leading-6 text-ink">
        <span className="font-semibold tabular-nums">Table 1. </span>
        {titleCase("permissions granted to each role")}
      </p>
      {/* The matrix is wider than its frame below about 1500 px (measured: 1271 px of content in a 976 px frame at 1280), so the hint shows at every width up to xl-plus. */}
      <p id="matrix-scroll-hint" className="text-credit max-w-[40rem] min-[1536px]:hidden">
        Scroll the table sideways to see all {ROLES.length} roles. The Permission column and the role headings stay in place.
      </p>
      <div
        role="region"
        tabIndex={0}
        aria-labelledby={captionId}
        aria-describedby="matrix-scroll-hint"
        className="relative max-h-[min(44rem,calc(100dvh-8rem))] w-full overflow-auto border-y-[1.5px] border-y-ink"
      >
        <table className="w-full border-separate border-spacing-0 text-left font-sans text-sm leading-5 text-ink" aria-labelledby={captionId}>
          <thead>
            <tr>
              <th scope="col" className={`${HEAD} left-0 z-20 min-w-[11rem] pl-0 text-left`}>
                Permission
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className={`${HEAD} min-w-[7.5rem] text-center whitespace-normal`}>
                  <span className="block">{ROLE_LABELS[r]}</span>
                  <span className="mt-1 block font-normal tracking-normal normal-case tabular-nums">{isStaffRole(r) ? `${holders[r]} holder(s)` : "not stored"}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p, i) => {
              const rule = i < PERMISSIONS.length - 1 ? "border-b border-b-rule" : "";
              return (
                <tr key={p} className="hover:bg-sunk [&:hover>th]:bg-sunk">
                  <th scope="row" className={`${ROW_HEAD} ${rule}`}>
                    <Mono className="text-ink">{p}</Mono>
                  </th>
                  {ROLES.map((r) =>
                    roleGrants(r, p) ? (
                      <td key={r} className={`h-11 px-2 text-center align-middle ${rule}`}>
                        <Check aria-hidden="true" className="inline size-5 stroke-2 text-ink" />
                        <span className="sr-only">Yes</span>
                      </td>
                    ) : (
                      <td key={r} className={`h-11 px-2 text-center align-middle text-ink-3 ${rule}`}>
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">No</span>
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
