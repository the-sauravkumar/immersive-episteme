"use client";

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

export const FIGURE_SIZES = "(min-width: 1024px) 544px, calc(100vw - 32px)";

export const DIAGRAM_READABLE_MIN_PX = Math.ceil((DIAGRAM_WIDTH * 12) / 10);

export interface KnowledgeFigureProps {
  figure: KnowledgeFigureData;
  number: number;
  first?: boolean;
  className?: string;
}

function Caption({ figure, number }: { figure: KnowledgeFigureData; number: number }) {
  return (
    <>
      <p className="t-s text-lime-dim">
        <span className="font-semibold text-lime">{figureLabel(number)}</span> {figure.caption}
      </p>
      <p className="t-s text-lime-dim mt-1">
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
        unoptimized
        loading={first ? "eager" : "lazy"}
        decoding="async"
        className="h-full w-full object-contain"
      />
    );

  let enlarged = media;
  if (figure.kind === "diagram") {
    enlarged = (
      <div className="w-full overflow-x-auto overscroll-x-contain" tabIndex={0} role="group" aria-label={FIGURE_TEXT.lightboxLabel(number)} data-slot="figure-scroll">
        <div className="aspect-[3/2] w-full border border-line bg-vat-2" style={{ minWidth: DIAGRAM_READABLE_MIN_PX }}>
          <StructureDiagramSvg diagram={figure.diagram} label={figure.alt} />
        </div>
      </div>
    );
  } else {
    const scale = Math.min(1, LIGHTBOX_MAX_EDGE / Math.max(figure.width, figure.height));
    const w = Math.round(figure.width * scale);
    const h = Math.round(figure.height * scale);
    enlarged = <Image src={figure.src} alt={figure.alt} width={w} height={h} sizes={`${w}px`} unoptimized loading="eager" decoding="async" className="mx-auto h-auto max-w-full" />;
  }

  return (
    <figure data-slot="knowledge-figure" data-figure-kind={figure.kind} data-figure-id={figure.id} className={cn("mt-4", className)}>
      <div className="relative aspect-[3/2] w-full overflow-hidden border border-line bg-vat-2" data-slot="figure-slot">
        {media}
      </div>
      <figcaption className="mt-2 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <Caption figure={figure} number={number} />
        </div>
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
