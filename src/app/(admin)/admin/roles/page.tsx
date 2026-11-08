import { Check } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { Mono } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Skeleton } from "@/components/ui/skeleton";
import { roleGrants } from "@/lib/permissions/matrix";
import { PERMISSIONS } from "@/lib/permissions/permissions";
import { PRINCIPAL_INVESTIGATOR, ROLE_LABELS, STAFF_ROLES, type StaffGrant } from "@/lib/permissions/roles";
import { titleCase } from "@/lib/text/title-case";
import { roleHolderCounts } from "@/server/admin/users";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Roles and Permissions" };

const POLICY = [
  "Each person holds one role: Admin, Researcher or Curator. The role decides which pages and actions they see; the detailed permissions below sit underneath and are not assigned one by one.",
  "Admin lets people in: staff accounts, roles, invite codes and settings, with read access elsewhere. An Admin cannot verify or publish content, run studies or see who a participant is.",
  "Researcher runs studies: setting them up, watching sessions, scoring and exporting pseudonymised data.",
  "Principal investigator is a mark on one Researcher, not a separate role. Only that person starts and closes studies, excludes sessions, sees and exports identifying data, removes participant data, and may also verify and publish content. These acts carry the ethics approval's accountability, so they stay with one named person.",
  "Curator looks after the content: writing, reviewing, verifying and publishing it in releases. Nobody verifies content they wrote or edited; another curator does.",
  "Every staff role may preview both learning doors; such visits are always marked as not part of the experiment.",
  "Participants and public visitors are never stored as roles: they come from a signed study-session cookie and from the absence of any sign-in.",
];

export const instant = false;

export default function Page() {
  return (
    <ConsolePage
      path="/admin/roles"
      title="Roles and permissions"
      description="What each role may do, and how many people hold it. Roles are given on the People page."
    >
      <div className="flex flex-col gap-12">
        <section aria-labelledby="policy" className="flex max-w-[40rem] flex-col gap-3">
          <h2 id="policy" className="t-h4 text-lime">
            {titleCase("the rules")}
          </h2>
          <ol className="t-b flex list-decimal flex-col gap-2 pl-6 text-lime marker:text-lime-dim marker:tabular-nums">
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

const HEAD = "t-label sticky top-0 z-10 h-11 border-b border-b-lime bg-vat px-2 pb-2 align-bottom";
const ROW_HEAD = "sticky left-0 z-[5] bg-vat py-2 pr-3 pl-0 text-left align-middle font-normal";

const COLUMNS: readonly StaffGrant[] = [...STAFF_ROLES, PRINCIPAL_INVESTIGATOR];

async function Matrix() {
  const actor = await requirePermission("admin.roles");
  const holders = await roleHolderCounts(getPool(), actor);
  return <MatrixTable holders={holders} />;
}

function MatrixTable({ holders }: { holders: Awaited<ReturnType<typeof roleHolderCounts>> }) {
  const captionId = "matrix-caption";
  return (
    <section aria-labelledby="matrix" className="flex min-w-0 flex-col gap-3">
      <h2 id="matrix" className="t-h4 text-lime">
        {titleCase("permission matrix")}
      </h2>
      <p className="t-b max-w-[40rem] text-lime-dim">
        A check means the role may do it; a dash means it may not. The principal investigator column lists what that Researcher gains on top. Counts leave out locked
        accounts.
      </p>
      <p id={captionId} className="font-sans t-s text-lime">
        <span className="font-semibold tabular-nums">Table 1. </span>
        {titleCase("permissions granted to each role")}
      </p>
      <p id="matrix-scroll-hint" className="t-s text-lime-dim max-w-[40rem] min-[1536px]:hidden">
        Scroll the table sideways to see every column. The first column and the headings stay in place.
      </p>
      <div
        role="region"
        tabIndex={0}
        aria-labelledby={captionId}
        aria-describedby="matrix-scroll-hint"
        className="relative max-h-[min(44rem,calc(100dvh-8rem))] w-full overflow-auto border-y-[1.5px] border-y-lime"
      >
        <table className="w-full border-separate border-spacing-0 text-left t-table text-lime" aria-labelledby={captionId}>
          <thead>
            <tr>
              <th scope="col" className={`${HEAD} left-0 z-20 min-w-[11rem] pl-0 text-left`}>
                Permission
              </th>
              {COLUMNS.map((r) => (
                <th key={r} scope="col" className={`${HEAD} min-w-[7.5rem] text-center whitespace-normal`}>
                  <span className="block">{ROLE_LABELS[r]}</span>
                  <span className="mt-1 block font-normal tabular-nums">{`${holders[r]} ${holders[r] === 1 ? "person" : "people"}`}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p, i) => {
              const rule = i < PERMISSIONS.length - 1 ? "border-b border-b-line" : "";
              return (
                <tr key={p} className="hover:bg-vat-2 [&:hover>th]:bg-vat-2">
                  <th scope="row" className={`${ROW_HEAD} ${rule}`}>
                    <Mono className="text-lime">{p}</Mono>
                  </th>
                  {COLUMNS.map((r) =>
                    roleGrants(r, p) ? (
                      <td key={r} className={`h-11 px-2 text-center align-middle ${rule}`}>
                        <Check aria-hidden="true" className="inline size-5 stroke-2 text-lime" />
                        <span className="sr-only">Yes</span>
                      </td>
                    ) : (
                      <td key={r} className={`h-11 px-2 text-center align-middle text-lime-dim ${rule}`}>
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
