import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPool } from "@/server/db/client";
import { listParticipants } from "@/server/research/sessions";
import { listStudies } from "@/server/research/studies";

import { Empty, pickStudy, Section, StatRow, StudyPicker, Timestamp } from "../_components/common";

export const metadata: Metadata = { title: "Participants" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/research/participants">) {
  return (
    <ConsolePage
      path="/research/participants"
      title="Participants"
      description="Pseudonymous participants and enrolment. Identifying records require separate permission."
    >
      <Participants searchParams={searchParams} />
    </ConsolePage>
  );
}

async function Participants({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pool = getPool();
  const studies = await listStudies(pool);
  const study = pickStudy(studies, sp.study);
  if (!study) return <StudyPicker studies={studies} current={null} />;
  const rows = await listParticipants(pool, study.id);
  const by = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <>
      <StudyPicker studies={studies} current={study.id} />
      <StatRow
        number={1}
        title="Enrolment by Status"
        items={[
          { label: "Enrolled (all)", value: rows.length },
          { label: "Active", value: by("active") },
          { label: "Completed", value: by("completed") },
          { label: "Withdrawn", value: by("withdrawn") },
          { label: "Excluded", value: by("excluded") },
        ]}
      />
      <Section
        id="participants"
        title="Participants"
        demo={study.isDemo}
        description="Participants appear only as their study code. No names, emails or contact data are stored by the platform; consent records are exported only in identified exports."
      >
        {rows.length === 0 ? (
          <Empty>No participants enrolled in this study.</Empty>
        ) : (
          <Table caption="Participants by Code" number={2} hoverRows density="compact">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Code</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Condition</TableHead>
                <TableHead scope="col">Stratum</TableHead>
                <TableHead scope="col" numeric>
                  Sessions (Completed)
                </TableHead>
                <TableHead scope="col">Enrolled (UTC)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-id">{r.code}</TableCell>
                  <TableCell>{r.status.replace(/_/g, " ")}</TableCell>
                  <TableCell>{r.condition ?? <span className="text-ink-3">Not allocated</span>}</TableCell>
                  <TableCell>{r.stratum ?? "–"}</TableCell>
                  <TableCell numeric className="whitespace-nowrap">
                    {r.sessions} ({r.completedSessions})
                  </TableCell>
                  <TableCell>
                    <Timestamp iso={r.enrolledAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
