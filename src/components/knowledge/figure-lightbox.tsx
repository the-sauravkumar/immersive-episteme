"use client";

/**
 * FigureLightbox (DESIGN.md 9.9): the one enlarged view of a knowledge figure, identical in both
 * conditions. A native modal <dialog> (focus is trapped by the browser) on an OPAQUE `--ground`
 * full viewport, because a translucent backdrop would show a page behind it in 2D and the scene in
 * 3D. The media is capped at 768 px on its long edge for every study figure (R-C20), centred, with
 * the caption and credit repeated below and a 44 px "Close" button at the top right. Escape or
 * Close returns focus to the Enlarge button (the caller passes `returnFocusTo`). No zoom gestures,
 * no animation.
 */
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { FIGURE_TEXT } from "@/features/learning/strings";

/** The long-edge cap of every study lightbox (DESIGN.md 9.9, 12.3 rule 10). */
export const LIGHTBOX_MAX_EDGE = 768;

export interface FigureLightboxProps {
  open: boolean;
  onClose(): void;
  /** Accessible name of the dialog ("Figure 2, enlarged"). */
  label: string;
  /** The enlarged media, already sized to the cap. */
  media: ReactNode;
  /** Caption and credit, repeated under the media. */
  caption: ReactNode;
  returnFocusTo?: RefObject<HTMLElement | null>;
}

export function FigureLightbox({ open, onClose, label, media, caption, returnFocusTo }: FigureLightboxProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      closeRef.current?.focus();
      wasOpen.current = true;
    } else if (!open && wasOpen.current) {
      if (d.open && typeof d.close === "function") d.close();
      else d.removeAttribute("open");
      wasOpen.current = false;
      returnFocusTo?.current?.focus();
    }
  }, [open, returnFocusTo]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      data-slot="figure-lightbox"
      onCancel={(e) => {
        // Escape: close through React state so focus returns to the Enlarge button.
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-auto border-0 bg-ground p-0 text-ink backdrop:bg-ground"
    >
      {open ? (
        <div className="flex min-h-full flex-col">
          <div className="flex justify-end p-2">
            <Button ref={closeRef} type="button" variant="outline" onClick={onClose}>
              <X aria-hidden="true" />
              {FIGURE_TEXT.close}
            </Button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-4 pb-8">
            <div className="w-full" style={{ maxWidth: LIGHTBOX_MAX_EDGE }}>
              {media}
              <div className="mt-3">{caption}</div>
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
