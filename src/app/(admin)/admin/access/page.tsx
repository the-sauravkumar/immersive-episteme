import { CircleCheck, CircleSlash, Clock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { CreateInviteForm, RevokeInviteButton } from "@/components/access/invite-admin-forms";
import { Empty, Section, Stamp } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { serverEnv } from "@/lib/env";
import { titleCase } from "@/lib/text/title-case";
import { listInvites, listStudyChoices, type InviteRow, type InviteStatus } from "@/server/access/invites";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";

export const metadata: Metadata = { title: "Access" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

/**
 * Admin -> Access (deployment source change S11): the site is always invite-only. Administrators
 * create codes with a label, an optional use limit, last day and study, see the use counts, and
 * revoke codes. Codes are stored hashed and shown once.
 */
export default function Page() {
  return (
    <ConsolePage
      path="/admin/access"
      title="Access"
      description="The site is invite-only: visitors need an invite code or link, and staff pass by signing in. Codes are stored hashed and shown only once, when they are created."
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Access />
      </Suspense>
    </ConsolePage>
  );
}

const STATUS: Record<InviteStatus, { label: string; variant: "ok" | "warn" | "danger"; Icon: typeof CircleCheck }> = {
  active: { label: "Active", variant: "ok", Icon: CircleCheck },
  expired: { label: "Expired", variant: "warn", Icon: Clock },
  used_up: { label: "Used up", variant: "warn", Icon: CircleSlash },
  revoked: { label: "Revoked", variant: "danger", Icon: CircleSlash },
};

function uses(row: InviteRow): string {
  return row.maxUses === null ? `${row.useCount}` : `${row.useCount} of ${row.maxUses}`;
}

async function Access() {
  const actor = await requirePermission("admin.users");
  const pool = getPool();
  const [invites, studies] = await Promise.all([listInvites(pool, actor), listStudyChoices(pool, actor)]);
  const active = invites.filter((i) => i.status === "active").length;
  return (
    <div className="flex flex-col gap-12">
      <Section id="create-invite" title="Create an invite code" description="One code per audience. Share links privately; never post a code publicly or put it in a document." className="max-w-3xl">
        <CreateInviteForm studies={studies} origin={serverEnv().BETTER_AUTH_URL} />
      </Section>

      <section aria-labelledby="invite-list" className="flex min-w-0 flex-col gap-4">
        <h2 id="invite-list" className="text-h2 text-ink">
          {titleCase("invite codes")}
        </h2>
        {invites.length === 0 ? (
          <Empty>No invite codes yet. Until one exists, only signed-in staff can open the site.</Empty>
        ) : (
          <Table
            role="table"
            caption="Invite Codes, Uses and Status"
            number={1}
            hoverRows
            note={`${invites.length} code(s), ${active} active; newest first. Times are UTC. Uses counts the browsers that redeemed the code.`}
          >
            <TableHeader role="rowgroup">
              <TableRow role="row">
                <TableHead role="columnheader" scope="col">
                  Label and code
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Study
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Status
                </TableHead>
                <TableHead role="columnheader" scope="col" numeric>
                  Uses
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Last day (UTC)
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Created (UTC)
                </TableHead>
                <TableHead role="columnheader" scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody role="rowgroup">
              {invites.map((i) => {
                const s = STATUS[i.status];
                return (
                  <TableRow role="row" key={i.id}>
                    <TableCell role="cell" className="align-top sm:py-3">
                      <span className="block font-medium text-ink">{i.label}</span>
                      <span className="text-id block text-ink-3">ending {i.hint}</span>
                    </TableCell>
                    <TableCell role="cell" className="align-top sm:py-3">
                      {i.studySlug ? <span className="text-id">{i.studySlug}</span> : <span className="text-ink-3">Site only</span>}
                    </TableCell>
                    <TableCell role="cell" className="align-top sm:py-3">
                      <span className="flex flex-col items-start gap-1">
                        <Badge variant={s.variant}>
                          <s.Icon aria-hidden="true" />
                          {s.label}
                        </Badge>
                        {i.revokedAt ? (
                          <span className="text-credit">
                            since <Stamp at={i.revokedAt} />
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell role="cell" numeric className="align-top sm:py-3">
                      <span>{uses(i)}</span>
                      {i.lastUsedAt ? (
                        <span className="text-credit block">
                          last <Stamp at={i.lastUsedAt} />
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell role="cell" className="align-top sm:py-3">
                      {i.expiresAt ? <Stamp at={i.expiresAt} withTime={false} /> : <span className="text-ink-3">No limit</span>}
                    </TableCell>
                    <TableCell role="cell" className="align-top sm:py-3">
                      <Stamp at={i.createdAt} />
                      {i.createdByName ? <span className="text-credit block">by {i.createdByName}</span> : null}
                    </TableCell>
                    <TableCell role="cell" className="text-right align-top sm:py-3">
                      {i.status === "revoked" ? null : <RevokeInviteButton inviteId={i.id} label={i.label} hint={i.hint} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
