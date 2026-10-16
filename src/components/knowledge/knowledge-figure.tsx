"use client";

/**
 * KnowledgeFigure (DESIGN.md 9.9): one study figure, rendered right after its anchor claim by
 * `ClaimList`, identically in both conditions (12.3 rule 8, parity checks P5, P14).
 *
 *  - A fixed 3:2 slot on the `--sunk` mat with a 1 px `--rule` outline, at the claim measure;
 *    portrait and square photographs letterbox inside it (object-fit: contain), so every figure has
 *    the same footprint. No ticks, radius or shadow.
 *  - kind `diagram`: the graph-derived SVG (DR-018). kind `photo`: next/image with explicit size,
 *    the literal `sizes` below, eager for the first figure of a view and lazy otherwise.
 *  - figcaption: "Fig. n" (600) and the caption in `text-caption`; the credit line in
 *    `text-credit` (a photo: "Photo: <credit>. Licence: <licence>", the licence linked when it
 *    has a URL); and ONE control, a 44 x 44 outline "Enlarge figure n" button in the caption row
 *    (the image itself is not a second trigger).
 *  - The lightbox shows the same media capped at 768 px on its long edge. A diagram there is never
 *    drawn narrower than `DIAGRAM_READABLE_MIN_PX`, so its smallest lettering stays at 12 px or more
 *    on a phone (the region scrolls sideways, keyboard-focusable). The Enlarge button shows its word
 *    as well as its icon: the sheet column is narrower than the 576-unit diagram at every width, so
 *    the inline lettering is under 12 px and Enlarge is the way to read it.
 */
import { Maximize2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { figureLabel } from "@/components/brand/numbering";
import { DIAGRAM_WIDTH } from "@/features/knowledge/read/diagrams";
import { Button } from "@/components/ui/button";
import type { KnowledgeFigureData } from "@/features/knowledge/read/view";
import { FIGURE_TEXT } from "@/features/learning/strings";
import { cn } from "@/lib/utils";

import { FigureLightbox, LIGHTBOX_MAX_EDGE } from "./figure-lightbox";
import { StructureDiagramSvg } from "./structure-diagram";

/** `sizes` of study figures: a literal (var() is invalid in sizes), the same in both conditions. */
export const FIGURE_SIZES = "(min-width: 1024px) 544px, calc(100vw - 32px)";

/**
 * The narrowest a diagram is drawn in the lightbox: its smallest lettering (10 user units, the
 * densest layout's labels in a 576-unit viewBox) then renders at 12 px.
 */
export const DIAGRAM_READABLE_MIN_PX = Math.ceil((DIAGRAM_WIDTH * 12) / 10);

export interface KnowledgeFigureProps {
  figure: KnowledgeFigureData;
  /** 1-based figure number within the concept view ("Fig. n"). */
  number: number;
  /** The first figure of a concept view loads eagerly (no fetchpriority); all others lazily. */
  first?: boolean;
  className?: string;
}

function Caption({ figure, number }: { figure: KnowledgeFigureData; number: number }) {
  return (
    <>
      <p className="text-caption">
        <span className="font-semibold text-ink">{figureLabel(number)}</span> {figure.caption}
      </p>
      <p className="text-credit mt-1">
        {figure.kind === "diagram" ? (
          figure.credit
        ) : (
          <>
            {FIGURE_TEXT.photoCredit(figure.credit)} {FIGURE_TEXT.licenceLabel}{" "}
            {figure.licenceUrl ? (
              <a href={figure.licenceUrl} target="_blank" rel="noopener noreferrer license" className="underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
                {figure.licence}
              </a>
            ) : (
              figure.licence
            )}
          </>
        )}
      </p>
    </>
  );
}

export function KnowledgeFigure({ figure, number, first = false, className }: KnowledgeFigureProps) {
  const [open, setOpen] = useState(false);
  const enlargeRef = useRef<HTMLButtonElement>(null);

  const media =
    figure.kind === "diagram" ? (
      <StructureDiagramSvg diagram={figure.diagram} label={figure.alt} />
    ) : (
      <Image
        src={figure.src}
        alt={figure.alt}
        width={figure.width}
        height={figure.height}
        sizes={FIGURE_SIZES}
        loading={first ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-contain"
      />
    );

  let enlarged = media;
  if (figure.kind === "diagram") {
    enlarged = (
      // A scrollable region on narrow screens: focusable and named, so it scrolls from the keyboard.
      <div className="w-full overflow-x-auto overscroll-x-contain" tabIndex={0} role="group" aria-label={FIGURE_TEXT.lightboxLabel(number)} data-slot="figure-scroll">
        <div className="aspect-[3/2] w-full border border-rule bg-sunk" style={{ minWidth: DIAGRAM_READABLE_MIN_PX }}>
          <StructureDiagramSvg diagram={figure.diagram} label={figure.alt} />
        </div>
      </div>
    );
  } else {
    const scale = Math.min(1, LIGHTBOX_MAX_EDGE / Math.max(figure.width, figure.height));
    const w = Math.round(figure.width * scale);
    const h = Math.round(figure.height * scale);
    enlarged = <Image src={figure.src} alt={figure.alt} width={w} height={h} sizes={`${w}px`} loading="eager" decoding="async" className="mx-auto h-auto max-w-full" />;
  }

  return (
    <figure data-slot="knowledge-figure" data-figure-kind={figure.kind} data-figure-id={figure.id} className={cn("mt-4", className)}>
      <div className="relative aspect-[3/2] w-full overflow-hidden border border-rule bg-sunk" data-slot="figure-slot">
        {media}
      </div>
      <figcaption className="mt-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Caption figure={figure} number={number} />
        </div>
        {/* Icon and word ("Enlarge", the start of its accessible name), the same in both conditions. */}
        <Button ref={enlargeRef} type="button" variant="outline" aria-label={FIGURE_TEXT.enlarge(number)} onClick={() => setOpen(true)} className="shrink-0 gap-2 px-3">
          <Maximize2 aria-hidden="true" />
          {FIGURE_TEXT.enlargeWord}
        </Button>
      </figcaption>
      <FigureLightbox
        open={open}
        onClose={() => setOpen(false)}
        label={FIGURE_TEXT.lightboxLabel(number)}
        media={enlarged}
        caption={<Caption figure={figure} number={number} />}
        returnFocusTo={enlargeRef}
      />
    </figure>
  );
}
