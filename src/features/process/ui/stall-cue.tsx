"use client";

import { DISMISS_CUE_LABEL, OPEN_HINT_LABEL, STALL_CUE_TEXT } from "../domain/guidance";
import type { GuidanceControls } from "./use-guidance";

export function StallCue({ guidance }: { readonly guidance: GuidanceControls }) {
  if (!guidance.cueVisible) return null;
  return (
    <div className="walking-cue" role="status">
      <p>{STALL_CUE_TEXT}</p>
      <div className="walking-cue-actions">
        <button type="button" className="walking-cue-button" onClick={guidance.followCue}>
          {OPEN_HINT_LABEL}
        </button>
        <button type="button" className="walking-cue-button" onClick={guidance.dismissCue}>
          {DISMISS_CUE_LABEL}
        </button>
      </div>
    </div>
  );
}
