"use client";

import { useEffect, useRef, useState } from "react";

import { HELP_TITLE, HINT_TITLE, PAUSE_TEXT, PAUSE_TITLE, RESUME_LABEL } from "@/features/process/domain/guidance";
import type { GuidanceControls } from "@/features/process/ui/use-guidance";

import { HelpIcon, HintIcon, PauseIcon } from "./course-icons";

type OpenDialog = "help" | "pause" | null;

function CourseDialog({ title, lines, action, onClose }: { readonly title: string; readonly lines: readonly string[]; readonly action: string; readonly onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className="course-dialog" aria-labelledby="course-dialog-title" onClose={onClose}>
      <h2 id="course-dialog-title">{title}</h2>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <button type="button" className="dialog-button" onClick={onClose}>
        {action}
      </button>
    </dialog>
  );
}

export interface PanelControls {
  readonly dialogOpen: boolean;
  readonly controls: (guidance?: GuidanceControls) => React.ReactNode;
}

export function usePanelControls(helpLines: readonly string[]): PanelControls {
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);
  return {
    dialogOpen: open !== null,
    controls: (guidance) => (
      <>
        {guidance && guidance.hint !== null ? (
          <button type="button" className="icon-button" aria-label={HINT_TITLE} onClick={guidance.openHint}>
            <HintIcon />
          </button>
        ) : null}
        <button type="button" className="icon-button" aria-label={HELP_TITLE} onClick={() => setOpen("help")}>
          <HelpIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Pause" onClick={() => setOpen("pause")}>
          <PauseIcon />
        </button>
        {open === "help" ? <CourseDialog title={HELP_TITLE} lines={helpLines} action="Close" onClose={close} /> : null}
        {open === "pause" ? <CourseDialog title={PAUSE_TITLE} lines={[PAUSE_TEXT]} action={RESUME_LABEL} onClose={close} /> : null}
        {guidance && guidance.hint !== null && guidance.hintOpen ? <CourseDialog title={HINT_TITLE} lines={[guidance.hint]} action="Close" onClose={guidance.closeHint} /> : null}
      </>
    ),
  };
}
