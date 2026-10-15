import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm, checkBoxClass, checkRowClass, Field, fieldClass } from "@/components/assessment/action-form";
import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ASSESSMENT_KINDS } from "@/lib/validation/enums";
import { listAssessments } from "@/server/assessment/definitions";
import { createAssessmentAction } from "@/server/assessment/research-actions";
import { getPool } from "@/server/db/client";

import { DemoBadge, Empty, LINK_44, PublishedBadge, Section } from "../_components/common";
import { NativeSelect } from "@/components/ui/native-select";

export const metadata: Metadata = { title: "Assessments" };

const KIND_LABEL: Record<string, string> = {
  pretest: "Pre-test",
  posttest: "Post-test",
  reconstruction: "Concept-map reconstruction",
  transfer: "Transfer task",
  questionnaire: "Questionnaire",
};

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page() {
  return (
    <ConsolePage
      path="/research/assessments"
      title="Assessments"
      description="Versioned instruments: items, answer keys, rubrics, the reconstruction concept set and its expert reference maps. Published versions cannot change."
    >
      <AssessmentList />
    </ConsolePage>
  );
}

async function AssessmentList() {
  const rows = await listAssessments(getPool());
  return (
    <>
      <Section id="instruments" title="Instruments" demo={rows.some((a) => a.isDemo)}>
        {rows.length === 0 ? (
          <Empty>No assessments yet.</Empty>
        ) : (
          <Table caption="Assessment Instruments" number={1} hoverRows>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Title</TableHead>
                <TableHead scope="col">Code</TableHead>
                <TableHead scope="col" numeric>
                  Version
                </TableHead>
                <TableHead scope="col">Kind</TableHead>
                <TableHead scope="col" numeric>
                  Items
                </TableHead>
                <TableHead scope="col">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="min-w-56 whitespace-normal">
                    <Link className={LINK_44} href={`/research/assessments/${a.id}`}>
                      {a.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-id">{a.code}</TableCell>
                  <TableCell numeric>v{a.version}</TableCell>
                  <TableCell>{KIND_LABEL[a.kind] ?? a.kind}</TableCell>
                  <TableCell numeric>{a.itemCount}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-2">
                      <PublishedBadge published={a.status === "locked"} />
                      {a.isDemo ? <DemoBadge label="Demo" /> : null}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section id="new" title="New assessment" description="Creates a draft version. Items, answer keys and rubrics are added on its page; publishing locks it.">
        <ActionForm action={createAssessmentAction} submitLabel="Create draft" redirectTo="/research/assessments/{id}" className="flex max-w-xl flex-col gap-4">
          <Field label="Code" hint="Lowercase letters, digits, '-' or '_'. Demo codes start with 'demo'.">
            <input name="code" required pattern="[a-z][a-z0-9_\-]{1,63}" className={fieldClass} />
          </Field>
          <Field label="Kind">
            <NativeSelect name="kind" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {ASSESSMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k] ?? k}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Title">
            <input name="title" required maxLength={300} className={fieldClass} />
          </Field>
          <Field label="Description (optional)">
            <textarea name="description" rows={2} maxLength={4000} className={fieldClass} />
          </Field>
          <label className={checkRowClass}>
            <input type="checkbox" name="isDemo" className={checkBoxClass} /> Demo data (never usable in a real study; title gets a “Demo:” prefix)
          </label>
        </ActionForm>
      </Section>
    </>
  );
}
