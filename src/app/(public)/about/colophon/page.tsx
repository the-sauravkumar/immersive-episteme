import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";

import { EditorialFrame, EditorialRow, EditorialSection, Prose } from "@/components/public/editorial-frame";
import { Sidenote } from "@/components/public/sidenote";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Colophon" };

type Swatch = { token: string; name: string; role: string };

const SWATCHES: readonly Swatch[] = [
  { token: "vat", name: "Vat", role: "The page and every bar" },
  { token: "vat-2", name: "Vat, raised", role: "Cards, fields, dialogs and other raised surfaces" },
  { token: "lime", name: "Lime", role: "Text, headings and button borders" },
  { token: "lime-dim", name: "Lime, dim", role: "Secondary text, field borders and table rules" },
  { token: "turmeric", name: "Turmeric", role: "The one interface colour: the current place, the forward button and the focus ring" },
  { token: "line", name: "Line", role: "Hairlines between rows and panes; never text" },
  { token: "cotton", name: "Cotton", role: "Toast surface, with stamp text" },
  { token: "madder", name: "Madder", role: "The danger button and the Sample Text mark" },
  { token: "madder-text", name: "Madder, text", role: "Errors, always with an icon and a word" },
  { token: "ok", name: "Ok", role: "Success, always with a word" },
  { token: "thread", name: "Thread", role: "Loose threads for steps not yet reached; never text" },
  { token: "off-bg", name: "Off", role: "Disabled controls, with off text" },
];

function readPalette(): Record<string, string> {
  try {
    const css = readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "src", "styles", "walking-tokens.css"), "utf8");
    const block = /(?:^|\n):root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const out: Record<string, string> = {};
    for (const decl of block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[decl[1]!] = decl[2]!.toUpperCase();
    return out;
  } catch {
    return {};
  }
}

function Palette() {
  const palette = readPalette();
  return (
    <ul className="grid gap-x-6 gap-y-8 xs:grid-cols-2 lg:grid-cols-3" aria-label="Palette">
      {SWATCHES.map((s) => (
        <li key={s.token} className="flex flex-col gap-2" data-token={s.token}>
          <div aria-hidden="true" className="mb-2 h-16 border border-line" style={{ background: `var(--${s.token})` }} />
          <p className="t-label text-lime">{s.name}</p>
          <p className="t-table font-semibold text-lime-dim">{palette[s.token] ?? null}</p>
          <p className="t-s text-lime-dim">{s.role}</p>
        </li>
      ))}
    </ul>
  );
}

export default function ColophonPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        className="mb-0"
        title="Colophon"
        description="How the platform is set: its typefaces, its colours, its fixed order, and how the two learning conditions are kept equivalent."
      />
      <EditorialFrame>
        <EditorialSection id="typefaces" title="Typefaces">
          <EditorialRow
            note={
              <Sidenote label="Budget">
                Two font files preloaded, Eczar 26,456 bytes and Mukta Regular 20,480 bytes, self-hosted with no request to a third party. Mukta
                Medium and Semibold load when a page uses them.
              </Sidenote>
            }
          >
            <Prose>
              Every page, both doors and every study and staff screen share two typefaces under the SIL Open Font License, and no others.
            </Prose>
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <p className="t-label">Eczar, for names, headings, labels and buttons</p>
              <p className="t-h3 text-lime">Immersive Episteme</p>
              <p className="t-s text-lime-dim">By the Eczar Project Authors, published by Rosetta Type.</p>
            </div>
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <p className="t-label">Mukta, for captions, body and small text</p>
              <p className="t-b text-lime">Body text is set at 18 pixels on a 27 pixel line, at most sixty-five characters to the line.</p>
              <p className="t-table text-lime-dim">Tabular figures for every number a reader compares: 0123456789.</p>
              <p className="t-s text-lime-dim">By Girish Dalvi, Ek Type.</p>
            </div>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="palette" title="Palette">
          <EditorialRow>
            <Prose>
              No colour on this platform is a measured or historical dye or cloth colour; today&rsquo;s dyes are mostly synthetic, so there is no
              single authentic value to measure. Every swatch is a design interpretation. There is one theme, the same on public, study and staff
              pages and in both doors.
            </Prose>
          </EditorialRow>
          <Palette />
        </EditorialSection>

        <EditorialSection id="order" title="Fixed order">
          <EditorialRow>
            <Prose>
              The visual course is always shown first and on the left, and the walkthrough second, on Explore and in Figure 1. Public pages
              and the demo list traditions in one alphabetical order. In a study, each participant learns one tradition, drawn at random so that
              every tradition is equally represented in each condition, and is tested only on that tradition.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="parity" title="Equivalence of the conditions">
          <EditorialRow>
            <Prose>
              The doors are compared from one stage template: the same stages, words, sources, model ids and file hashes. A content parity report is
              stored with each study. The suite that measured the earlier interfaces was removed with them, so no interface measures are
              published.
            </Prose>
          </EditorialRow>
        </EditorialSection>
      </EditorialFrame>
    </div>
  );
}
