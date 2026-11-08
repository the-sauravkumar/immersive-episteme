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
import { PageHeader } from "@/components/shell/page-header";
import { howToCite, INSTITUTION } from "@/config/institution";
import { BLIND_STEPS, DEFAULT_STEPS, NEW_STUDY_CONFIG, STEP_LABEL, type StudyStep } from "@/server/study/config";
import { getDatasetStats, getImageCredits, getPullQuoteClaim } from "@/server/public/dataset-stats";

export const metadata: Metadata = { title: "About" };

const STANDALONE =
  "inline-flex min-h-11 items-center text-turmeric underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-turmeric-hi hover:decoration-2";
const LINK =
  "text-turmeric underline decoration-1 underline-offset-[0.2em] transition-[text-decoration-thickness] duration-(--dur-1) hover:text-turmeric-hi hover:decoration-2";

const LEARNING_INDEX = DEFAULT_STEPS.indexOf("learning");
const BEFORE = DEFAULT_STEPS.filter((s) => (BLIND_STEPS as readonly StudyStep[]).includes(s));
const PREPARE = DEFAULT_STEPS.slice(0, LEARNING_INDEX).filter((s) => !BEFORE.includes(s));
const AFTER = DEFAULT_STEPS.slice(LEARNING_INDEX + 1);

const FLOW = [
  { id: "consent", label: ["Consent"], fill: "raised" },
  { id: "before", label: ["Before", "learning"], fill: "raised" },
  { id: "prepare", label: ["Practice and", "introduction"], fill: "raised" },
  { id: "learning", label: ["Learning", "task"], fill: "accent" },
  { id: "after", label: ["After", "learning"], fill: "raised" },
] as const satisfies readonly { id: string; label: readonly string[]; fill: DiagramNode["fill"] }[];

const FLOW_BOX = { width: 112, height: 64, gap: 24 } as const;

function flowDiagram(vertical: boolean): { width: number; height: number; nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const { width: w, height: h, gap } = FLOW_BOX;
  const step = (vertical ? h : w) + gap;
  const nodes: DiagramNode[] = FLOW.map((s, i) => ({
    id: s.id,
    x: vertical ? 8 : i * step,
    y: vertical ? 8 + i * step : 8,
    width: w,
    height: h,
    fill: s.fill,
    label: [...s.label],
  }));
  const edges: DiagramEdge[] = FLOW.slice(1).map((_, i) => ({
    id: `e${i}`,
    d: vertical ? `M${8 + w / 2} ${8 + i * step + h} V${8 + (i + 1) * step - 2}` : `M${i * step + w} ${8 + h / 2} H${(i + 1) * step - 2}`,
    arrow: true,
  }));
  const span = FLOW.length * step - gap;
  return vertical ? { width: w + 16, height: span + 16, nodes, edges } : { width: span + 2, height: h + 16, nodes, edges };
}

function FigureTwo() {
  const wide = flowDiagram(false);
  const tall = flowDiagram(true);
  return (
    <figure className="flex flex-col gap-3">
      <div className="bg-vat-2 p-4">
        <OutlineDiagram {...wide} className="mx-auto hidden lg:block" />
        <OutlineDiagram {...tall} className="mx-auto max-w-[8rem] lg:hidden" />
      </div>
      <figcaption className="t-s text-lime-dim">
        <span className="font-bold text-lime">{chartFigureLabel(2)}.</span> The default order of a new study in the study engine. Every
        participant takes the same steps.
      </figcaption>
    </figure>
  );
}

function StepList() {
  const groups: [string, readonly StudyStep[] | null][] = [
    ["Consent", null],
    ["Before learning", BEFORE],
    ["Practice and introduction", PREPARE],
    ["Learning task", null],
    ["After learning", AFTER],
  ];
  return (
    <ol className="t-b flex list-decimal flex-col gap-2 pl-6 text-lime" aria-label="Study steps, in order">
      {groups.map(([label, steps]) => (
        <li key={label}>
          <span className="font-semibold">{label}</span>
          {steps && steps.length > 0 ? <span className="text-lime-dim">: {steps.map((s) => STEP_LABEL[s]).join("; ")}</span> : null}
        </li>
      ))}
    </ol>
  );
}

async function DatasetLive() {
  const stats = await getDatasetStats();
  if (!stats) return <Prose className="text-lime-dim">The dataset counts could not be read just now.</Prose>;
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
          supports it. Learners can open the sources behind each stage caption, with the same locator and passage. A passage supports curator review; it does
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
  if (credits === null) return <Prose className="text-lime-dim">The image records could not be read just now.</Prose>;
  if (credits.length === 0) {
    return <Prose>No photograph has been verified for the platform yet, so no figure is currently a photograph.</Prose>;
  }
  return (
    <>
      <Prose>
        {credits.length === 1 ? "One verified photograph is" : `${formatCount(credits.length)} verified photographs are`} recorded, with these credits
        and licences:
      </Prose>
      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {credits.map((c) => (
          <li key={c.id} className="t-b flex flex-col gap-1 py-3">
            <span className="font-semibold text-lime">{c.title}</span>
            <span className="t-s text-lime-dim">
              {c.credit}. Licence:{" "}
              {c.licenceUrl ? (
                <a href={c.licenceUrl} className={`${LINK} inline-flex min-h-11 items-center`} rel="noopener noreferrer" target="_blank">
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
        description="A research platform about how people learn a craft process from one cited body of knowledge."
      />
      <EditorialFrame>
        <EditorialSection id="purpose" title="Purpose">
          <EditorialRow>
            <Prose>
              Immersive Episteme studies how people learn a craft process, the stages of Indian hand-block printing, from one cited body of
              knowledge. The learning task, the study engine and the assessments are all built from one knowledge model, so that everything a
              participant reads can be traced to a cited source.
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
              Participants consent and answer the questions before learning. After a short practice with the controls, they learn one
              tradition, visiting every stop of its process within a time limit ({minutes} minutes in a new study), and may finish once every
              stop has been visited, so each participant&rsquo;s learning time is recorded rather than fixed. They then answer questions and
              tasks about that tradition after learning.
            </Prose>
          </EditorialRow>
          <FigureTwo />
          <EditorialRow>
            <StepList />
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="dataset" title="Dataset and citation standard">
          <Suspense fallback={<Prose className="text-lime-dim">Reading the dataset counts…</Prose>}>
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
              Each tradition&rsquo;s product stop shows two study photographs, a textile and a set of printing blocks. A study protocol can switch
              photographs off. The learning task shows no diagrams generated from the knowledge graph. Photographs are shown only when their licence
              has been checked, always with their credit and licence.
            </Prose>
            <Suspense fallback={<Prose className="text-lime-dim">Reading the image records…</Prose>}>
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
            <Link href="/privacy" className={`t-label self-start ${STANDALONE}`}>
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
