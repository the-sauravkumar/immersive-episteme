import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fixed } from "@/components/analytics/encoding";
import { MapViewer } from "@/components/assessment/map-viewer";
import { ConsolePage } from "@/components/shell/gates";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssessmentError } from "@/server/assessment/common";
import { mapBreakdown } from "@/server/assessment/scoring";
import { getPool } from "@/server/db/client";

import { LINK_44, Notice, Section, SummaryList } from "../../../_components/common";

export const metadata: Metadata = { title: "Concept-map breakdown" };

const CLASS_LABEL: Record<string, string> = {
  correct: "Correct",
  optional_match: "Matches an optional edge",
  wrong_type: "Right pair and direction, wrong type",
  wrong_direction: "Right pair, wrong direction",
  unsupported: "Not in the reference",
  out_of_scope: "Out of scope",
  duplicate: "Duplicate",
};
const LEVEL_LABEL: Record<string, string> = {
  undirected_unlabelled: "Pair only",
  directed_unlabelled: "Pair + direction",
  directed_labelled: "Pair + direction + type",
};
const CHANGE_LABEL: Record<string, string> = { added: "Added", removed: "Removed", changed: "Changed" };
/** Counts as integers, rates with 3 decimals; "–" when absent, "n/a" when undefined for the map. */
/** Concept-map metrics that are counts (printed as integers); every other score is a proportion or ratio (2 decimals). */
const COUNT_METRICS = new Set([
  "cmap.causal_chain_depth",
  "cmap.cross_category.total",
  "cmap.cross_category.valid",
  "cmap.edges_drawn",
  "cmap.edit_distance",
  "cmap.incorrect_relationships",
  "cmap.missing_expected_relationships",
  "cmap.valid_relationships",
]);
/** Fixed decimals per metric (DESIGN.md 10 precision): counts as integers, proportions to 2 decimals, "–" when undefined or not stored. */
const fmt = (metric: string, v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : COUNT_METRICS.has(metric) ? v.toFixed(0) : fixed(v, 2);
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");

/** May block: access is verified against the staff session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page({ params, searchParams }: PageProps<"/research/scoring/maps/[conceptMapId]">) {
  return (
    <ConsolePage path="/research/scoring/maps/[conceptMapId]" title="Concept-map breakdown" description="How each relationship of one participant map was classified against the reference, the resulting scores, and the map as submitted.">
      <Breakdown params={params} searchParams={searchParams} />
    </ConsolePage>
  );
}

async function Breakdown({ params, searchParams }: { params: Promise<{ conceptMapId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { conceptMapId } = await params;
  const sp = await searchParams;
  const refId = typeof sp.ref === "string" ? sp.ref : "";
  let b;
  try {
    b = await mapBreakdown(getPool(), conceptMapId, refId);
  } catch (err) {
    if (err instanceof AssessmentError) notFound();
    throw err;
  }
  const label = new Map(b.set.concepts.map((c) => [c.conceptId, c.label]));
  const nodeLabel = new Map(b.payload.nodes.map((n) => [n.key, n.label]));
  const typeLabel = (code: string | null) => (code === null ? "is linked to" : (b.set.relationshipTypes.find((t) => t.code === code)?.label ?? code));
  const edgeByKey = new Map(b.payload.edges.map((e) => [e.key, e]));
  /** Canonical key "A>B#TYPE" / "A~B#TYPE" as a sentence. */
  const keySentence = (key: string | null) => {
    if (!key) return "–";
    const m = /^(.+?)([>~])(.+?)#(.*)$/.exec(key);
    if (!m) return key;
    return `${label.get(m[1]!) ?? m[1]} ${typeLabel(m[4] || null)} ${label.get(m[3]!) ?? m[3]}${m[2] === "~" ? " (both ways)" : ""}`;
  };
  let table = 0;

  return (
    <>
      <p className="mb-4">
        <Link href={`/research/scoring?ref=${b.reference.id}`} className={LINK_44}>
          Back to scoring
        </Link>
      </p>
      <SummaryList
        className="mb-10 max-w-[52rem]"
        items={[
          { label: "Participant", value: <span className="text-id">{b.map.participantCode}</span> },
          { label: "Condition", value: b.map.condition === "immersive_3d" ? "3D" : "2D" },
          {
            label: "Phase",
            value: (
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {b.map.phase === "pre" ? "Before learning" : "After learning"}
                {b.otherPhaseMapId ? (
                  <Link href={`/research/scoring/maps/${b.otherPhaseMapId}?ref=${b.reference.id}`} className={LINK_44}>
                    Open the {b.map.phase === "pre" ? "post-learning" : "pre-learning"} map
                  </Link>
                ) : null}
              </span>
            ),
          },
          {
            label: "Reference",
            value: (
              <>
                <span className="tabular-nums">v{b.reference.version}</span> ({b.reference.title}), fingerprint <span className="text-id">{b.reference.fingerprint.slice(0, 12)}</span>
              </>
            ),
          },
          { label: "Parameters", value: b.parametersSource === "stored" ? "As stored with the scores" : "Current assessment configuration (not scored yet)" },
        ]}
      />

      {b.mismatches.length > 0 ? (
        <Notice tone="error" title="Error">
          Stored scores differ from a recomputation: {b.mismatches.join(", ")}
        </Notice>
      ) : null}

      <Section demo={b.reference.isDemo} id="edges" title="Participant relationships">
        <Table caption="Participant Relationships by Class" number={++table} hoverRows>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Relationship</TableHead>
              <TableHead scope="col">Class</TableHead>
              <TableHead scope="col">Counted As</TableHead>
              <TableHead scope="col">Best Match</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.result.participantEdges.map((e) => {
              const raw = edgeByKey.get(e.edgeKey);
              return (
                <TableRow key={e.edgeKey}>
                  <TableCell className="min-w-64 whitespace-normal">
                    {nodeLabel.get(e.sourceNodeKey) ?? e.sourceNodeKey} {typeLabel(e.originalType)} {nodeLabel.get(e.targetNodeKey) ?? e.targetNodeKey}
                    {raw && !raw.directed ? " (both ways)" : ""}
                  </TableCell>
                  <TableCell className="whitespace-normal">{CLASS_LABEL[e.class] ?? e.class}</TableCell>
                  <TableCell>{e.valid ? "Valid" : e.incorrect ? "Incorrect" : "Not counted"}</TableCell>
                  <TableCell className="whitespace-normal">{e.matchedLevel ? LEVEL_LABEL[e.matchedLevel] : (e.outOfScopeReason ?? "None")}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Section>

      <Section demo={b.reference.isDemo} id="ref-edges" title="Reference relationships">
        <Table caption="Reference Relationships and Participant Matches" number={++table} hoverRows>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Relationship</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Participant Match</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.result.referenceEdges.map((e) => (
              <TableRow key={e.canonicalKey}>
                <TableCell className="min-w-64 whitespace-normal">{keySentence(e.canonicalKey)}</TableCell>
                <TableCell>{sentenceCase(e.status)}</TableCell>
                <TableCell>{e.missing ? "Missing" : e.matchedLevel ? LEVEL_LABEL[e.matchedLevel] : "None"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section demo={b.reference.isDemo} id="scores" title="Scores" description="Recomputed now from the stored map and reference, beside the value stored when the map was scored.">
        <Table caption="Scores, Recomputed and Stored" number={++table}>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Metric</TableHead>
              <TableHead scope="col">Version</TableHead>
              <TableHead scope="col" numeric>
                Recomputed
              </TableHead>
              <TableHead scope="col" numeric>
                Stored
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {b.result.scores.map((s) => (
              <TableRow key={s.metricName}>
                <TableCell className="text-id">{s.metricName}</TableCell>
                <TableCell className="text-id">{s.metricVersion}</TableCell>
                <TableCell numeric>{fmt(s.metricName, s.value)}</TableCell>
                <TableCell numeric>{fmt(s.metricName, b.stored.find((x) => x.metricName === s.metricName)?.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      {b.change ? (
        <Section demo={b.reference.isDemo} id="change" title="Change from before to after learning">
          {b.change.changes.length ? (
            <ul className="mb-6 flex max-w-[52rem] flex-col border-y border-rule">
              {b.change.changes.map((c, i) => (
                <li key={i} className="text-body grid gap-x-4 border-t border-rule py-2 text-ink first:border-t-0 xs:grid-cols-[6rem_minmax(0,1fr)]">
                  <span className="text-label self-center">{CHANGE_LABEL[c.kind] ?? c.kind}</span>
                  <span>{c.kind === "added" ? keySentence(c.after) : c.kind === "removed" ? keySentence(c.before) : `${keySentence(c.before)}, now ${keySentence(c.after)}`}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {b.change.scoreDeltas ? (
            <Table caption="Score Change, Before to After Learning" number={++table}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Metric</TableHead>
                  <TableHead scope="col" numeric>
                    Before
                  </TableHead>
                  <TableHead scope="col" numeric>
                    After
                  </TableHead>
                  <TableHead scope="col" numeric>
                    Change
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.change.scoreDeltas.map((d) => (
                  <TableRow key={d.metricName}>
                    <TableCell className="text-id">{d.metricName}</TableCell>
                    <TableCell numeric>{fmt(d.metricName, d.pre)}</TableCell>
                    <TableCell numeric>{fmt(d.metricName, d.post)}</TableCell>
                    <TableCell numeric>{fmt(d.metricName, d.delta)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </Section>
      ) : null}

      <Section demo={b.reference.isDemo} id="raw" title="The map as submitted" description={`${b.payload.editLog.length} recorded edit${b.payload.editLog.length === 1 ? "" : "s"}. Read-only.`}>
        <MapViewer
          concepts={b.set.concepts}
          relationshipTypes={b.set.relationshipTypes}
          directedLinks={b.set.directedLinks}
          payload={b.payload}
          label={`Concept map of ${b.map.participantCode}, ${b.map.phase}`}
        />
      </Section>
    </>
  );
}
