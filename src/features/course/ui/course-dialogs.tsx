"use client";

import { useEffect, useRef, useState } from "react";

import { HELP_LINES, HELP_TITLE, PAUSE_TEXT, PAUSE_TITLE, RESUME_LABEL } from "@/features/process/domain/guidance";

import { HelpIcon, PauseIcon } from "./course-icons";

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

export function usePanelControls(): { readonly controls: React.ReactNode; readonly dialogOpen: boolean } {
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);
  return {
    dialogOpen: open !== null,
    controls: (
      <>
        <button type="button" className="icon-button" aria-label={HELP_TITLE} onClick={() => setOpen("help")}>
          <HelpIcon />
        </button>
        <button type="button" className="icon-button" aria-label="Pause" onClick={() => setOpen("pause")}>
          <PauseIcon />
        </button>
        {open === "help" ? <CourseDialog title={HELP_TITLE} lines={HELP_LINES} action="Close" onClose={close} /> : null}
        {open === "pause" ? <CourseDialog title={PAUSE_TITLE} lines={[PAUSE_TEXT]} action={RESUME_LABEL} onClose={close} /> : null}
      </>
    ),
  };
}
