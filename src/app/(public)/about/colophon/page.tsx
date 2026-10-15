/**
 * Colophon (DESIGN.md 11.2): how the platform is set. Typefaces with specimens and the font
 * budget; the palette as swatches framed by registration ticks, each labelled "Design
 * interpretation; not a measured or historical dye colour" (R-C6); the decorative pattern
 * note; the fixed condition order; and the full parity-check list (DESIGN.md 12.4) with the latest
 * real result per check, read from the stored report (never sample values).
 *
 * The swatch values are read from `src/app/globals.css` itself (the token file), so the page can
 * never disagree with the colours actually in use.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Metadata } from "next";
import { Suspense } from "react";

import { KnockoutField } from "@/components/brand/knockout-band";
import { TickedFrame } from "@/components/brand/registration-ticks";
import { EditorialFrame, EditorialRow, EditorialSection, Prose } from "@/components/public/editorial-frame";
import { Sidenote } from "@/components/public/sidenote";
import { EquivalenceMonitor } from "@/components/parity/equivalence-monitor";
import { PageHeader } from "@/components/shell/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PARITY_CHECKS } from "@/features/research/interface-parity";
import { getInterfaceParityReport } from "@/server/public/dataset-stats";

export const metadata: Metadata = { title: "Colophon" };

// ---- Palette, read from the token file -------------------------------------------------------

type Swatch = { token: string; name: string; role: string };

const SWATCHES: readonly Swatch[] = [
  { token: "ground", name: "Ground", role: "The reading surface of every page and knowledge column" },
  { token: "ink", name: "Ink", role: "Text, headings, rules and diagram outlines" },
  { token: "indigo", name: "Indigo", role: "The one interactive accent: links, buttons, focus" },
  { token: "band", name: "Band", role: "Field of the knock-out band" },
  { token: "madder", name: "Madder", role: "Public pages only: plate and figure numbers, section rules" },
  { token: "ochre", name: "Ochre", role: "Public pages only: editorial eyebrows" },
  { token: "ochre-deco", name: "Ochre dot", role: "Decorative dots in the band; never text" },
  { token: "surface", name: "Surface", role: "Cards, dialogs and the hint panel" },
  { token: "sunk", name: "Sunk", role: "Table heads, figure mats, the console rail" },
  { token: "ink-3", name: "Ink, tertiary", role: "Source lines, credits, eyebrows" },
  { token: "rule-strong", name: "Strong rule", role: "Boundaries of controls" },
  { token: "wash", name: "Wash", role: "A selected row or answer, always with a bar and a word" },
  { token: "danger", name: "Danger", role: "Errors, always with an icon and a word" },
  { token: "series-2d", name: "Series 2D", role: "Dashboard charts: the 2D condition, circles" },
  { token: "series-3d", name: "Series 3D", role: "Dashboard charts: the 3D condition, squares" },
];

function tokenBlock(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  const out: Record<string, string> = {};
  if (!match?.[1]) return out;
  for (const decl of match[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[decl[1]!] = decl[2]!.toUpperCase();
  return out;
}

function readPalette(): { light: Record<string, string>; dark: Record<string, string> } {
  try {
    const css = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
    return { light: tokenBlock(css, ":root"), dark: tokenBlock(css, ".dark") };
  } catch {
    return { light: {}, dark: {} };
  }
}

function Palette() {
  const { light, dark } = readPalette();
  return (
    <ul className="grid gap-x-6 gap-y-8 xs:grid-cols-2 lg:grid-cols-3" aria-label="Palette">
      {SWATCHES.map((s) => (
        <li key={s.token} className="flex flex-col gap-2" data-token={s.token}>
          <TickedFrame className="mx-1.5 mb-2">
            <div aria-hidden="true" className="h-16 border border-rule" style={{ background: `var(--${s.token})` }} />
          </TickedFrame>
          <p className="text-ui mx-1.5 text-ink">{s.name}</p>
          <p className="text-mono mx-1.5 text-ink-2">
            {light[s.token] ? <>Light {light[s.token]}</> : null}
            {light[s.token] && dark[s.token] ? " · " : null}
            {dark[s.token] ? <>Dark {dark[s.token]}</> : null}
          </p>
          {/* The identical label sits above the role, so the labels of a row share one baseline. */}
          <p className="text-credit mx-1.5 font-semibold">Design interpretation; not a measured or historical dye colour.</p>
          <p className="text-credit mx-1.5">{s.role}</p>
        </li>
      ))}
    </ul>
  );
}

// ---- Parity checks (DESIGN.md 12.4) ----------------------------------------------------------

/**
 * The full parity-check list (DESIGN.md 11.2, 12.4) through WP0's Equivalence Monitor. With a
 * stored run it is the monitor's full per-check table. Without one the monitor says "No parity
 * run recorded yet." and the list below documents what each check compares, with no result column,
 * so nothing reads as a result.
 */
async function ParityTable() {
  const report = await getInterfaceParityReport();
  if (report) return <EquivalenceMonitor interfaceParity={report} full tone="neutral" numbers={{ interface: 1 }} />;
  return (
    <>
      <EquivalenceMonitor interfaceParity={null} tone="neutral" />
      <Table caption="Interface Parity Checks" number={1} note="Results appear here only from a stored run, never as sample values.">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Check</TableHead>
            <TableHead scope="col">What Is Compared</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {PARITY_CHECKS.map(({ id, label }) => (
            <TableRow key={id}>
              <TableCell className="tabular-nums">{id}</TableCell>
              <TableCell className="whitespace-normal">{label}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}

export default function ColophonPage() {
  return (
    <div className="flex flex-col gap-12">
      <PageHeader
        className="mb-0"
        eyebrow="About"
        title="Colophon"
        description="How the platform is set: its typefaces, its colours, its one decorative pattern, and the measured equivalence of the two learning conditions."
      />
      <EditorialFrame>
        <EditorialSection id="typefaces" title="Typefaces">
          <EditorialRow note={<Sidenote label="Budget">At most two font files preloaded and 176,000 bytes, self-hosted with no request to a third party. Measured when the faces were adopted: two files, 170,600 bytes.</Sidenote>}>
            <div className="flex flex-col gap-2 border-t border-rule pt-4">
              <p className="text-eyebrow">Source Serif 4 · titles, headings, quotations</p>
              <p className="font-serif text-[2.5rem] leading-[3rem] font-normal text-ink">Immersive Episteme</p>
              <p className="text-quote text-ink">&ldquo;The evidence is set as large as the claim it supports.&rdquo;</p>
            </div>
            <div className="flex flex-col gap-2 border-t border-rule pt-4">
              <p className="text-eyebrow">Inter · claims, interface, tables</p>
              <p className="text-reading text-ink">Claims are set at 18 pixels on a 28 pixel line, about sixty characters to the line, in both conditions.</p>
              <p className="text-table text-ink-2">Tabular figures for every number a reader compares: 0123456789</p>
            </div>
            <div className="flex flex-col gap-2 border-t border-rule pt-4">
              <p className="text-eyebrow">System monospace · codes and identifiers</p>
              <p className="text-mono text-ink">0123456789 ABCDEF abcdef</p>
            </div>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="palette" title="Palette">
          <EditorialRow>
            <Prose>
              No colour on this platform is a measured or historical dye or cloth colour; today&rsquo;s dyes are mostly synthetic, so there is no
              single authentic value to measure. Every swatch is therefore labelled as a design interpretation. Light is the default theme; dark and
              high contrast are offered in Display Settings, and study pages are always light.
            </Prose>
          </EditorialRow>
          <Palette />
        </EditorialSection>

        <EditorialSection id="pattern" title="Decorative pattern">
          <EditorialRow
            note={
              <Sidenote>
                <p>Decorative pattern, not craft content. Never shown on study pages, in either condition.</p>
              </Sidenote>
            }
          >
            <div className="overflow-hidden">
              <KnockoutField columns={4} rows={1} />
            </div>
            <Prose>
              The band under the header is built from a square block module: a lozenge and a dot reversed out of a flat indigo field, on a straight
              grid, with edges that meet exactly. It deliberately uses no motif, layout or colour set that belongs to one tradition.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="order" title="Fixed order">
          <EditorialRow>
            <Prose>
              The conventional pages are always shown first and on the left, and the immersive museum second, on Explore and in Figure 1. Traditions
              are always listed in one alphabetical order, the same in both conditions.
            </Prose>
          </EditorialRow>
        </EditorialSection>

        <EditorialSection id="parity" title="Equivalence of the conditions">
          <EditorialRow>
            <Prose>
              Each check compares a concept page in the conventional pages with the same concept in the museum&rsquo;s information panel, at four
              screen sizes. Study pages are always light, so of the four display themes requested only two take effect: light, and light with high
              contrast. A check marked partial passed in every part that was measured, but has a part that was not measured; that part is named
              under it.
            </Prose>
          </EditorialRow>
          <Suspense fallback={<Prose className="text-ink-2">Reading the latest parity run…</Prose>}>
            <ParityTable />
          </Suspense>
        </EditorialSection>
      </EditorialFrame>
    </div>
  );
}
