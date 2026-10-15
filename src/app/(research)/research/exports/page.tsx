import { Download } from "lucide-react";
import type { Metadata } from "next";

import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can } from "@/lib/permissions/can";
import { plural } from "@/lib/text/plural";
import { getStaffPrincipal } from "@/server/auth/staff";
import { getPool } from "@/server/db/client";
import { DASHBOARD_TABLES, EXPORT_TABLES, exportMetricRoles, type TableSpec } from "@/server/research/exports/dictionary";
import { staleMetricSessions } from "@/server/research/metrics/pipeline";
import { listStudies } from "@/server/research/studies";

import { Disclosure, LINK_44, LINK_BUTTON, Notice, pickStudy, Section, StudyPicker } from "../_components/common";

export const metadata: Metadata = { title: "Exports" };

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ searchParams }: PageProps<"/research/exports">) {
  return (
    <ConsolePage
      path="/research/exports"
      title="Exports"
      description="Pseudonymised CSV/JSON exports, joinable on participant, session, condition, concept and event ids."
    >
      <Exports searchParams={searchParams} />
    </ConsolePage>
  );
}

async function Exports({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const pool = getPool();
  const [studies, principal] = await Promise.all([listStudies(pool), getStaffPrincipal()]);
  const study = pickStudy(studies, sp.study);
  if (!study) return <StudyPicker studies={studies} current={null} />;
  const stale = await staleMetricSessions(pool, study.id);
  const identified = can(principal, "exports.identified");
  const scopes = identified ? (["pseudonymised", "identified"] as const) : (["pseudonymised"] as const);
  const href = (scope: string, format: string, table?: string) =>
    `/research/exports/download?study=${study.id}&scope=${scope}&format=${format}${table ? `&table=${table}` : ""}`;
  let tableNo = 0;
  return (
    <>
      <StudyPicker studies={studies} current={study.id} />
      {stale.stale > 0 ? (
        <Notice tone="warn" title="Warning">
          {plural(stale.stale, "session")} {stale.stale === 1 ? "has" : "have"} missing or stale derived metrics. Recompute them on the Analytics page first, or the re-import check will report them.
        </Notice>
      ) : null}
      {scopes.map((scope) => {
        const tables = EXPORT_TABLES.filter((t) => scope === "identified" || !t.identifiedOnly);
        return (
          <Section
            key={scope}
            id={scope}
            title={scope === "pseudonymised" ? "Pseudonymised export" : "Identified export (principal investigator)"}
            demo={study.isDemo}
            description={
              scope === "pseudonymised"
                ? "Participants appear only as their study code. No consent records, no researcher free text (annotations, deviation descriptions, exclusion details): only their categories."
                : "Adds consent records, annotations and the free-text reasons. Handle under the approved data-protection plan."
            }
            actions={
              <a className={LINK_BUTTON} href={href(scope, "json")} download>
                <Download aria-hidden="true" />
                Download the full bundle (JSON)
              </a>
            }
          >
            <p className="text-credit mb-4 max-w-[52rem]">
              The bundle holds every table plus the study configuration snapshot, content and manifest hashes, the data dictionary, reproducibility metadata and per-table checksums.
            </p>
            <Table caption={scope === "pseudonymised" ? "Pseudonymised Tables" : "Identified Tables"} number={++tableNo} hoverRows density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Table</TableHead>
                  <TableHead scope="col">Contents</TableHead>
                  <TableHead scope="col" numeric>
                    Columns
                  </TableHead>
                  <TableHead scope="col">CSV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="text-id">{t.name}</TableCell>
                    <TableCell className="min-w-64 whitespace-normal">{t.description}</TableCell>
                    <TableCell numeric>{t.columns.length}</TableCell>
                    <TableCell>
                      <a className={LINK_44} href={href(scope, "csv", t.name)} download>
                        {t.name}.csv
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        );
      })}
      <Section
        id="dictionary"
        title="Data dictionary"
        description={
          <>
            Column definitions. CSV cells holding objects are JSON text; empty cells are null. Validate a downloaded bundle offline with{" "}
            <code className="text-id">python -m episteme_stats validate bundle.json</code> (analysis/).
          </>
        }
      >
        <div className="flex flex-col border-y border-rule">
          {[...EXPORT_TABLES.filter((t) => identified || !t.identifiedOnly), ...DASHBOARD_TABLES].map((t: TableSpec) => (
            <Disclosure
              key={t.name}
              className="border-t border-rule first:border-t-0"
              summary={<span className="text-id">{t.name}</span>}
              detail={
                <>
                  {t.description}
                  {t.name.startsWith("dashboard_") ? " CSV from the research dashboard (/research/dashboard); first line is a # comment naming the metric versions." : ""}
                </>
              }
            >
              <Table label={`Columns of ${t.name}`} density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Column</TableHead>
                    <TableHead scope="col">Type</TableHead>
                    <TableHead scope="col">Meaning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.columns.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell className="text-id">{c.name}</TableCell>
                      <TableCell className="text-id">{c.type}</TableCell>
                      <TableCell className="min-w-64 whitespace-normal">{c.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Disclosure>
          ))}
          <Disclosure
            className="border-t border-rule"
            summary={<span className="text-id">metricRoles</span>}
            detail="Preregistration role of each metric (bundle key metricRoles). Primary outcome: cmap.recall.dl on the post-learning map, ANCOVA with the pre-test score as covariate (D2). Metrics not listed are exploratory."
          >
            <Table label="Metric roles" density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Metric</TableHead>
                  <TableHead scope="col">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exportMetricRoles([])
                  .roles.filter((r) => r.role !== "exploratory")
                  .map((r) => (
                    <TableRow key={r.metric}>
                      <TableCell className="text-id">{r.metric}</TableCell>
                      <TableCell>{r.role}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </Disclosure>
        </div>
      </Section>
    </>
  );
}
