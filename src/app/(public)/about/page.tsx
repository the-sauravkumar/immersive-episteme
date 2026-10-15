/**
 * About (DESIGN.md 11.2), in the editorial frame. Sections in order: Purpose; Method with Figure 2
 * (the study flow); Equivalence; Dataset and Citation Standard; Images and Licences; Data
 * Protection; Team and Affiliations; Ethics; How to Cite; Contact. A section with no verified
 * content is omitted entirely (13): the last four render only what `src/config/institution.ts`
 * supplies, through the same components as the study's information and consent page.
 *
 * Facts about the platform come from the code that implements them (the study engine's default
 * order, the stored parity report, the live dataset); statements about the craft appear only as
 * real dataset claims with their sources (the pull-quote).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { chartFigureLabel } from "@/components/brand/numbering";
import { OutlineDiagram, type DiagramEdge, type DiagramNode } from "@/components/brand/outline-diagram";
import { DatasetTable } from "@/components/public/dataset-table";
import { EditorialFrame, EditorialRow, EditorialSection, Prose } from "@/components/public/editorial-frame";
import { formatCount } from "@/components/public/figure-one";
import { PullQuote } from "@/components/public/pull-quote";
import { AffiliationList, CitationText, ContactLink, TeamList } from "@/components/public/team-and-ethics";
import { Sidenote } from "@/components/public/sidenote";
import { EquivalenceMonitor } from "@/components/parity/equivalence-monitor";
import { PageHeader } from "@/components/shell/page-header";
import { howToCite, INSTITUTION } from "@/config/institution";
import { BLIND_STEPS, DEFAULT_STEPS, NEW_STUDY_CONFIG, STEP_LABEL, type StudyStep } from "@/server/study/config";
import { studyConfigSchema } from "@/features/study/contracts";
import { getDatasetStats, getImageCredits, getInterfaceParityReport, getPullQuoteClaim } from "@/server/public/dataset-stats";

export const metadata: Metadata = { title: "About" };

/** The protocol default of the structure-diagram switch (DR-018), read from the study contract itself. */
const STRUCTURE_DIAGRAMS_BY_DEFAULT = studyConfigSchema.shape.figures.parse(undefined).structureDiagrams;

/** A link on its own line: a 44 px target (DESIGN.md 9.1). */
const STANDALONE =
  "inline-flex min-h-11 items-center text-indigo underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-indigo-hover hover:decoration-2";
const LINK =
  "text-indigo underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-indigo-hover hover:decoration-2";

// ---- Figure 2: the default study flow, derived from the study engine's default order ----------

const LEARNING_INDEX = DEFAULT_STEPS.indexOf("learning");
const BEFORE = DEFAULT_STEPS.filter((s) => (BLIND_STEPS as readonly StudyStep[]).includes(s));
const PREPARE = DEFAULT_STEPS.slice(0, LEARNING_INDEX).filter((s) => !BEFORE.includes(s));
const AFTER = DEFAULT_STEPS.slice(LEARNING_INDEX + 1);

/*
 * Both geometries are authored at the size they render, so the 13 px labels (7.4) are never scaled
 * below 13 px: the wide flow (762 units) shows from 1024 px, where the figure box is 798 px wide;
 * the tall flow (320 units) fits the 324 px box at 390 px.
 */
function flowDiagram(vertical: boolean): {
  width: number;
  height: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
} {
  const stages = [
    { id: "consent", label: ["Consent"] },
    { id: "before", label: ["Before", "learning"] },
    { id: "allocation", label: ["Allocation"] },
    { id: "prepare", label: ["Practice and", "introduction"] },
  ];
  if (!vertical) {
    const w = 104;
    const gap = 24;
    const lw = 120; // the two learning nodes
    const nodes: DiagramNode[] = stages.map((s, i) => ({
      id: s.id,
      x: i * (w + gap),
      y: 78,
      width: w,
      height: 64,
      fill: s.id === "allocation" ? "wash" : "sunk",
      label: s.label,
    }));
    const lx = 4 * (w + gap);
    nodes.push({ id: "learn-2d", x: lx, y: 16, width: lw, height: 64, fill: "indigo", label: ["Learning:", "2D pages"] });
    nodes.push({ id: "learn-3d", x: lx, y: 140, width: lw, height: 64, fill: "indigo", label: ["Learning:", "3D museum"] });
    nodes.push({ id: "after", x: lx + lw + gap, y: 78, width: w, height: 64, fill: "sunk", label: ["After", "learning"] });
    const edges: DiagramEdge[] = [0, 1, 2].map((i) => ({
      id: `e${i}`,
      d: `M${i * (w + gap) + w} 110 H${(i + 1) * (w + gap) - 2}`,
      arrow: true,
    }));
    const px = 3 * (w + gap) + w;
    const mid = gap / 2;
    edges.push({ id: "e-2d", d: `M${px} 110 H${px + mid} V48 H${lx - 2}`, arrow: true });
    edges.push({ id: "e-3d", d: `M${px} 110 H${px + mid} V172 H${lx - 2}`, arrow: true });
    const ax = lx + lw;
    edges.push({ id: "e-a2d", d: `M${ax} 48 H${ax + mid} V110 H${ax + gap - 2}`, arrow: true });
    edges.push({ id: "e-a3d", d: `M${ax} 172 H${ax + mid} V110 H${ax + gap - 2}`, arrow: false });
    return { width: ax + gap + w + 2, height: 220, nodes, edges };
  }
  const nodes: DiagramNode[] = stages.map((s, i) => ({
    id: s.id,
    x: 80,
    y: 8 + i * 96,
    width: 160,
    height: 64,
    fill: s.id === "allocation" ? "wash" : "sunk",
    label: s.label,
  }));
  nodes.push({ id: "learn-2d", x: 8, y: 392, width: 144, height: 64, fill: "indigo", label: ["Learning:", "2D pages"] });
  nodes.push({ id: "learn-3d", x: 168, y: 392, width: 144, height: 64, fill: "indigo", label: ["Learning:", "3D museum"] });
  nodes.push({ id: "after", x: 80, y: 512, width: 160, height: 64, fill: "sunk", label: ["After", "learning"] });
  const edges: DiagramEdge[] = [0, 1, 2].map((i) => ({
    id: `e${i}`,
    d: `M160 ${72 + i * 96} V${102 + i * 96}`,
    arrow: true,
  }));
  edges.push({ id: "e-2d", d: "M160 360 V374 H80 V390", arrow: true });
  edges.push({ id: "e-3d", d: "M160 360 V374 H240 V390", arrow: true });
  edges.push({ id: "e-a2d", d: "M80 456 V484 H160 V510", arrow: true });
  edges.push({ id: "e-a3d", d: "M240 456 V484 H160", arrow: false });
  return { width: 320, height: 584, nodes, edges };
}

function FigureTwo() {
  const wide = flowDiagram(false);
  const tall = flowDiagram(true);
  return (
    <figure className="flex flex-col gap-3">
      <div className="bg-sunk p-4">
        <OutlineDiagram {...wide} className="mx-auto hidden lg:block" />
        <OutlineDiagram {...tall} className="mx-auto max-w-[20rem] lg:hidden" />
      </div>
      <figcaption className="text-caption">
        <span className="font-bold text-ink">{chartFigureLabel(2)}.</span> The default order of a new study in the study engine. Every
        participant takes the same steps; only the learning step differs by condition.
      </figcaption>
    </figure>
  );
}

function StepList() {
  const groups: [string, readonly StudyStep[] | null][] = [
    ["Consent", null],
    ["Before learning, blind to condition", BEFORE],
    ["Allocation to one condition", null],
    ["Practice and introduction, in the allocated condition", PREPARE],
    ["Learning, in 2D pages or the 3D museum", ["learning"]],
    ["After learning", AFTER],
  ];
  return (
    <ol className="text-body flex list-decimal flex-col gap-2 pl-6 text-ink" aria-label="Study steps, in order">
      {groups.map(([label, steps]) => (
        <li key={label}>
          <span className="font-semibold">{label}</span>
          {steps && steps.length > 0 && !(steps.length === 1 && steps[0] === "learning") ? (
            <span className="text-ink-2">: {steps.map((s) => STEP_LABEL[s]).join("; ")}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// ---- Live sections -----------------------------------------------------------------------------

/** The read-only Equivalence Monitor (WP0): the latest stored interface parity run, or "No parity run recorded yet." */
async function EquivalenceResult() {
  const report = await getInterfaceParityReport();
  return <EquivalenceMonitor interfaceParity={report} tone="neutral" />;
}

async function DatasetLive() {
  const stats = await getDatasetStats();
  if (!stats) return <Prose className="text-ink-2">The dataset counts could not be read just now.</Prose>;
  const { totals } = stats;
  return (
    <>
      <EditorialRow
        note={
          <Sidenote label="Live counts">
            <p>
              <span className="tabular-nums">{formatCount(totals.evidencedClaims)}</span> of{" "}
              <span className="tabular-nums">{formatCount(totals.claims)}</span> claims carry a located verbatim passage from a cited source;{" "}
              <span className="tabular-nums">{formatCount(totals.citedClaims)}</span> cite at least one source.
            </p>
          </Sidenote>
        }
      >
        <Prose>
          Every claim in the dataset names the source it comes from, with a precise location in that source, and carries the verbatim passage that
          supports it. Learners open that record from the source note under each claim, in both conditions. A passage supports curator review; it does
          not by itself verify the claim, so records still under review are labelled as such.
        </Prose>
      </EditorialRow>
      <DatasetTable stats={stats} number={1} title="The Dataset by Tradition" />
    </>
  );
}

async function PullQuoteLive() {
  const claim = await getPullQuoteClaim();
  if (!claim) return null;
  return (
    <EditorialRow
      note={
        <Sidenote label="Source">
          <p>{claim.citation.title}</p>
          {claim.citation.locator ? <p>{claim.citation.locator}</p> : null}
        </Sidenote>
      }
    >
      <PullQuote claim={claim} />
    </EditorialRow>
  );
}

async function ImageCreditsLive() {
  const credits = await getImageCredits();
  if (credits === null) return <Prose className="text-ink-2">The image records could not be read just now.</Prose>;
  if (credits.length === 0) {
    return <Prose>No photograph has been verified for the platform yet, so no figure is currently a photograph.</Prose>;
  }
  return (
    <>
      <Prose>
        {credits.length === 1 ? "One verified photograph is" : `${formatCount(credits.length)} verified photographs are`} recorded, with these credits
        and licences:
      </Prose>
      <ul className="flex flex-col divide-y divide-rule border-y border-rule">
        {credits.map((c) => (
          <li key={c.id} className="text-body flex flex-col gap-1 py-3">
            <span className="font-semibold text-ink">{c.title}</span>
            <span className="text-credit">
              {c.credit}. Licence:{" "}
              {c.licenceUrl ? (
                <a href={c.licenceUrl} className={LINK} rel="noopener noreferrer" target="_blank">
                  {c.licence}
                </a>
              ) : (
                c.licence
              )}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function AboutPage() {
  const minutes = NEW_STUDY_CONFIG.exposure.minutes;
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        className="mb-0"
        title="About the project"
        description="A research platform comparing how people learn craft knowledge through conventional pages and through a spatially organised museum."
      />
      <EditorialFrame>
        <EditorialSection id="purpose" title="Purpose">
          <EditorialRow>
            <Prose>
              Immersive Episteme asks whether learning the same cited knowledge in a walkable 3D museum differs from learning it in conventional 2D
              pages. Both conditions are built from one knowledge model, one study engine and one set of assessments, so that a difference in results
              can be traced to the way the knowledge is organised in space, not to its content or to the quality of the interface.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="method" title="Method">
          <EditorialRow
            note={
              <Sidenote>
                <p>
                  This is the default order of a new study. The researchers set each study&rsquo;s protocol, and it is fixed before the first
                  participant takes part.
                </p>
              </Sidenote>
            }
          >
            <Prose>
              Participants consent, answer the questions before learning, and are then allocated to one condition. After a short practice with the
              controls, they learn for a fixed time that is the same in both conditions ({minutes} minutes in a new study), then answer the same
              questions and tasks after learning.
            </Prose>
          </EditorialRow>
          <FigureTwo />
          <EditorialRow>
            <StepList />
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="equivalence" title="Equivalence">
          <EditorialRow
            note={
              <Sidenote>
                <p>The full list of checks, with the latest result of each, is on the Colophon.</p>
                <Link href="/about/colophon#parity" className={STANDALONE}>
                  Parity checks on the Colophon
                </Link>
              </Sidenote>
            }
          >
            <Prose>
              The two conditions present the same claims, citations and figures through the same components, typefaces, controls and timer. Only the
              spatial organisation and the navigation differ. Measurable parity checks compare the two conditions on the same concept pages, from the
              text and its line breaks to the size of every control, and their stored results are published here.
            </Prose>
            <Suspense fallback={<p className="text-reading text-ink-2">Reading the latest parity run…</p>}>
              <EquivalenceResult />
            </Suspense>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="dataset" title="Dataset and citation standard">
          <Suspense fallback={<Prose className="text-ink-2">Reading the dataset counts…</Prose>}>
            <DatasetLive />
          </Suspense>
          <Suspense fallback={null}>
            <PullQuoteLive />
          </Suspense>
        </EditorialSection>

        <EditorialSection id="images-and-licences" title="Images and licences">
          <EditorialRow
            note={
              <Sidenote>
                <p>Public pages use typographic plates instead of photographs.</p>
              </Sidenote>
            }
          >
            <Prose>
              {STRUCTURE_DIAGRAMS_BY_DEFAULT
                ? "By default, a study shows diagrams generated from the concepts and relationships of the knowledge graph, in both conditions alike. A study protocol can switch them off, again in both conditions together."
                : "By default, a study shows no diagrams generated from the knowledge graph. A study protocol can switch them on, in both conditions together."}{" "}
              Each such diagram is credited &ldquo;Diagram generated from the project&rsquo;s knowledge graph&rdquo; and shows nothing the claims do
              not state. Photographs are shown only when their licence has been checked, always with their credit and licence.
            </Prose>
            <Suspense fallback={<Prose className="text-ink-2">Reading the image records…</Prose>}>
              <ImageCreditsLive />
            </Suspense>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="data-protection" title="Data protection">
          <EditorialRow>
            <Prose>
              Participants take part under a pseudonymous study identifier and never create an account. Nothing done in the public demo is stored as
              study data. The privacy page describes what the platform records and where.
            </Prose>
            <Link href="/privacy" className={`text-ui self-start ${STANDALONE}`}>
              Read the privacy page
            </Link>
          </EditorialRow>
        </EditorialSection>

        {INSTITUTION.authors.length > 0 ? (
          <EditorialSection id="team" title="Team and affiliations">
            <EditorialRow>
              <TeamList institution={INSTITUTION} />
              <AffiliationList institution={INSTITUTION} />
            </EditorialRow>
          </EditorialSection>
        ) : null}

        {INSTITUTION.ethicsReference?.trim() ? (
          <EditorialSection id="ethics" title="Ethics">
            <EditorialRow>
              <Prose>Ethics approval for the study: {INSTITUTION.ethicsReference.trim()}. Participants read the study information and give consent before taking part, and may withdraw during the study.</Prose>
            </EditorialRow>
          </EditorialSection>
        ) : null}

        {howToCite(INSTITUTION) ? (
          <EditorialSection id="how-to-cite" title="How to cite">
            <EditorialRow>
              {INSTITUTION.paperCitation ? null : <Prose>Until the paper is published, please cite the platform:</Prose>}
              <CitationText institution={INSTITUTION} />
            </EditorialRow>
          </EditorialSection>
        ) : null}

        {INSTITUTION.contact?.trim() ? (
          <EditorialSection id="contact" title="Contact">
            <EditorialRow>
              <Prose>
                For questions about the project or the study, write to <ContactLink institution={INSTITUTION} />.
              </Prose>
            </EditorialRow>
          </EditorialSection>
        ) : null}
      </EditorialFrame>
    </div>
  );
}
