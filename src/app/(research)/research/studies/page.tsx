import type { Metadata } from "next";
import Link from "next/link";

import { ConsolePage } from "@/components/shell/gates";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { can } from "@/lib/permissions/can";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { listStudies } from "@/server/research/studies";

import { ActionForm } from "../_components/action-form";
import { DemoBadge, Empty, FieldLabel, LINK_44, Section, SELECT, StatusBadge, Timestamp } from "../_components/common";
import { createStudyAction } from "../actions";

export const metadata: Metadata = { title: "Studies" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page() {
  return (
    <ConsolePage path="/research/studies" title="Studies" description="Study protocols, arms, condition assignment and activation.">
      <Studies />
    </ConsolePage>
  );
}

async function Studies() {
  const [studies, principal] = await Promise.all([listStudies(getPool()), getStaffPrincipal()]);
  return (
    <>
      <Section id="all" title="All studies" demo={studies.some((s) => s.isDemo)}>
        {studies.length === 0 ? (
          <Empty>No studies yet.</Empty>
        ) : (
          <Table caption="Studies" number={1} hoverRows>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Study</TableHead>
                <TableHead scope="col">Protocol</TableHead>
                <TableHead scope="col">Design</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Updated (UTC)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {studies.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="min-w-56 whitespace-normal">
                    <Link className={LINK_44} href={`/research/studies/${s.id}`}>
                      {s.title}
                    </Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="text-mono text-ink-3">{s.slug}</span>
                      {s.isDemo ? <DemoBadge label="Demo" /> : null}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{s.protocolVersion}</TableCell>
                  <TableCell>{s.design === "within" ? "Within subjects" : s.design === "between" ? "Between subjects" : s.design}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell>
                    <Timestamp iso={s.updatedAt} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
      {can(principal, "study.configure") ? (
        <Section id="new" title="New study" description="Creates a draft with a conventional 2D and an immersive 3D condition. Configure, check parity and activate it on its page.">
          <ActionForm action={createStudyAction} submitLabel="Create draft study" className="grid max-w-xl gap-4">
            <FieldLabel label="Title">
              <Input name="title" required maxLength={300} />
            </FieldLabel>
            <FieldLabel label="Slug" hint="Lowercase letters, digits and hyphens. Slugs starting with “demo” are reserved.">
              <Input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
            </FieldLabel>
            <FieldLabel label="Protocol version">
              <Input name="protocolVersion" required maxLength={64} defaultValue="1.0" />
            </FieldLabel>
            <FieldLabel label="Design">
              <select name="design" defaultValue="between" className={SELECT}>
                <option value="between">Between subjects</option>
                <option value="within">Within subjects (needs matched content sets)</option>
              </select>
            </FieldLabel>
            <FieldLabel label="Description (optional)">
              <Textarea name="description" rows={3} maxLength={4000} />
            </FieldLabel>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
