import { CircleCheck, CircleDashed, CircleSlash, Clock } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { pickStudy, StudyPicker } from "@/app/(research)/research/_components/common";
import { CopyButton } from "@/components/access/invite-admin-forms";
import { Empty, Section, Stamp } from "@/components/cms/bits";
import { ConsolePage } from "@/components/shell/gates";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { studyReturnLink } from "@/lib/access/share-links";
import { serverEnv } from "@/lib/env";
import { canReturn, listParticipantReturns, RETURN_STATUS_LABELS, type ReturnStatus } from "@/server/admin/participants";
import { requirePermission } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { listStudies } from "@/server/research/studies";

export const metadata: Metadata = { title: "Participants" };

export const instant = false;

export default function Page({ searchParams }: PageProps<"/admin/participants">) {
  return (
    <ConsolePage
      path="/admin/participants"
      title="Participants"
      description="Each participant's code and return link, so anyone who closed the browser can be sent back to where they stopped. No names or contact details are shown here."
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Participants searchParams={searchParams} />
      </Suspense>
    </ConsolePage>
  );
}

const STATUS_LOOK: Record<ReturnStatus, { variant: "ok" | "warn" | "danger" | "neutral"; Icon: typeof CircleCheck }> = {
  not_started: { variant: "neutral", Icon: CircleDashed },
  in_progress: { variant: "ok", Icon: CircleCheck },
  awaiting_delayed: { variant: "warn", Icon: Clock },
  finished: { variant: "neutral", Icon: CircleCheck },
  ended: { variant: "neutral", Icon: CircleSlash },
  withdrawn: { variant: "danger", Icon: CircleSlash },
  excluded: { variant: "danger", Icon: CircleSlash },
};

const NO_RETURN: Partial<Record<ReturnStatus, string>> = {
  not_started: "No session yet: they enter the study code again.",
  finished: "Nothing left to do.",
  ended: "The session has ended.",
  withdrawn: "Withdrawn.",
  excluded: "Excluded.",
};

async function Participants({ searchParams }: { searchParams: PageProps<"/admin/participants">["searchParams"] }) {
  const actor = await requirePermission("admin.users");
  const pool = getPool();
  const studies = await listStudies(pool);
  const study = pickStudy(studies, (await searchParams).study);
  if (!study) return <Empty>No studies yet.</Empty>;
  const rows = await listParticipantReturns(pool, actor, study.id);
  const origin = serverEnv().BETTER_AUTH_URL;
  const returnable = rows.filter((r) => canReturn(r.status)).length;
  return (
    <div className="flex flex-col gap-4">
      <StudyPicker studies={studies} current={study.id} />
      <Section
        id="return-links"
        title="Return links"
        description="A return link opens the study where the participant stopped, on any device, as long as the invite they joined with is not revoked and the break is within the study's rules. Send it only to that participant."
      >
        {rows.length === 0 ? (
          <Empty>Nobody has joined this study yet.</Empty>
        ) : (
          <Table role="table" caption="Participants and Return Links" number={1} hoverRows note={`${rows.length} participant(s), ${returnable} can return now; latest activity first. Times are UTC.`}>
            <TableHeader role="rowgroup">
              <TableRow role="row">
                <TableHead role="columnheader" scope="col">
                  Participant code
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Status
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Last activity (UTC)
                </TableHead>
                <TableHead role="columnheader" scope="col">
                  Return link
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody role="rowgroup">
              {rows.map((r) => {
                const look = STATUS_LOOK[r.status];
                const link = studyReturnLink(origin, study.slug, r.code);
                return (
                  <TableRow role="row" key={r.code}>
                    <TableCell role="cell" className="align-top sm:py-3">
                      <span className="t-table font-semibold whitespace-nowrap text-lime">{r.code}</span>
                    </TableCell>
                    <TableCell role="cell" className="align-top sm:py-3">
                      <Badge variant={look.variant}>
                        <look.Icon aria-hidden="true" />
                        {RETURN_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell role="cell" className="align-top sm:py-3">
                      <Stamp at={r.lastActivityAt} />
                    </TableCell>
                    <TableCell role="cell" className="align-top sm:py-3">
                      {canReturn(r.status) ? (
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="t-table font-semibold min-w-0 wrap-anywhere text-lime">{link}</span>
                          <CopyButton value={link} what={`the return link for ${r.code}`} />
                        </span>
                      ) : (
                        <span className="t-s text-lime-dim">{NO_RETURN[r.status]}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
