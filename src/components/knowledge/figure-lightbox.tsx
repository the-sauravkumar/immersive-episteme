"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { FIGURE_TEXT } from "@/features/learning/strings";

export const LIGHTBOX_MAX_EDGE = 768;

export interface FigureLightboxProps {
  open: boolean;
  onClose(): void;
  label: string;
  media: ReactNode;
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
        e.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-auto border-0 bg-vat p-0 text-lime backdrop:bg-vat"
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
