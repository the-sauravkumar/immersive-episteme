"use client";

import { useState } from "react";

import { HELP_TITLE, HINT_TITLE, PAUSE_TEXT, PAUSE_TITLE, RESUME_LABEL } from "@/features/process/domain/guidance";
import { DoorDialog } from "@/features/process/ui/door-dialog";
import type { GuidanceControls } from "@/features/process/ui/use-guidance";

import { HelpIcon, HintIcon, PauseIcon } from "@/features/process/ui/door-icons";

type OpenDialog = "help" | "pause" | null;

function CourseDialog({ title, lines, action, onClose, offersWithdrawal }: { readonly title: string; readonly lines: readonly string[]; readonly action: string; readonly onClose: () => void; readonly offersWithdrawal?: boolean }) {
  return (
    <DoorDialog className="course-dialog" title={title} action={action} onClose={onClose} offersWithdrawal={offersWithdrawal}>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </DoorDialog>
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
        {open === "help" ? <CourseDialog title={HELP_TITLE} lines={helpLines} action="Close" onClose={close} offersWithdrawal /> : null}
        {open === "pause" ? <CourseDialog title={PAUSE_TITLE} lines={[PAUSE_TEXT]} action={RESUME_LABEL} onClose={close} offersWithdrawal /> : null}
        {guidance && guidance.hint !== null && guidance.hintOpen ? <CourseDialog title={HINT_TITLE} lines={[guidance.hint]} action="Close" onClose={guidance.closeHint} /> : null}
      </>
    ),
  };
}
