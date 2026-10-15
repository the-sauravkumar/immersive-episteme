"use client";

/**
 * Hybrid guidance (study decision D6), SHARED by both conditions so it looks, behaves and is
 * logged identically: the always-available hint control and the stall cue.
 *
 *   <GuidanceProvider guidance={ctx.settings.guidance}>   // inside <TelemetryProvider>
 *     <HintControl />   // in the condition's top toolbar, next to the learning timer
 *     <StallCue />      // bottom-right of the condition's view
 *   </GuidanceProvider>
 *
 * Off (renders nothing, logs nothing) unless `policy = "hybrid"` and `cueEnabled`. The stall rule
 * is the shared pure detector (src/features/learning/guidance.ts) fed once a second from the
 * shared time accountant, so "a new concept was exposed" means the same in 2D and 3D. Every use
 * emits `guidance_cue_used` with the same metadata in both conditions:
 *   hint opened  {action: shown, cueId: guidance.hint}    hint closed  {action: dismissed, ...hint}
 *   stall shown  {action: shown, cueId: guidance.stall}   "Show the hint" {action: followed, ...stall}
 *   stall dismissed {action: dismissed, cueId: guidance.stall}
 * The hint panel is non-modal and never pauses or ends content exposure (like the task prompts).
 * The hint text comes verbatim from the protocol; the component supplies only interface wording.
 *
 * Look (DESIGN.md 9.17): Hint is a 44 px ghost button in the StudyBar; its panel is a non-modal
 * `--surface` card with a 1 px `--rule-strong` border and no shadow, opening instantly. The stall
 * cue is a `--ground` card with a 4 px `--indigo` left border; in high contrast it takes the
 * reserved yellow guidance cue (the only yellow in the interface), identically in both conditions.
 */
import { Lightbulb, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { createStallDetector, GUIDANCE_CUE_IDS, GUIDANCE_TEXT } from "@/features/learning/guidance";
import { hybridGuidanceOn, type GuidanceSettings } from "@/features/learning/settings";
import { useOptionalTelemetry } from "@/features/telemetry/client/provider";
import { titleCase } from "@/lib/text/title-case";
import { cn } from "@/lib/utils";

/** How often the stall detector samples the time accountant. */
const STALL_SAMPLE_MS = 1000;

interface GuidanceValue {
  hintText: string | null;
  hintOpen: boolean;
  stallVisible: boolean;
  openHint(): void;
  closeHint(): void;
  followStall(): void;
  dismissStall(): void;
}

const GuidanceContext = createContext<GuidanceValue | null>(null);

export function GuidanceProvider({ guidance, stallCue = true, children }: { guidance: GuidanceSettings; stallCue?: boolean; children: ReactNode }) {
  const on = hybridGuidanceOn(guidance);
  const telemetry = useOptionalTelemetry();
  const [hintOpen, setHintOpen] = useState(false);
  const [stallVisible, setStallVisible] = useState(false);

  const log = useCallback(
    (action: "shown" | "followed" | "dismissed", cueId: string) => {
      void telemetry?.guidanceCueUsed({ metadata: { action, cueId } });
    },
    [telemetry],
  );

  // The stall rule, sampled from the shared time accountant.
  const stallSeconds = guidance.stallSeconds;
  useEffect(() => {
    if (!on || !stallCue || !telemetry) return;
    const detector = createStallDetector(stallSeconds);
    const sample = () => {
      const open = telemetry.timing.current();
      const before = detector.seenCount();
      const due = detector.tick({ nowMs: performance.now(), exposedConceptId: open?.kind === "exposure" ? open.conceptId : null, paused: telemetry.timing.paused() });
      if (due) {
        setStallVisible(true);
        log("shown", GUIDANCE_CUE_IDS.stall);
      } else if (detector.seenCount() > before) {
        // Something new is on screen: the cue has served its purpose (not a participant action, not logged).
        setStallVisible(false);
      }
    };
    sample();
    const id = window.setInterval(sample, STALL_SAMPLE_MS);
    return () => window.clearInterval(id);
  }, [on, stallCue, telemetry, stallSeconds, log]);

  const value = useMemo<GuidanceValue | null>(() => {
    if (!on) return null;
    return {
      hintText: guidance.hintText,
      hintOpen,
      stallVisible,
      openHint() {
        if (hintOpen) return;
        setHintOpen(true);
        log("shown", GUIDANCE_CUE_IDS.hint);
      },
      closeHint() {
        if (!hintOpen) return;
        setHintOpen(false);
        log("dismissed", GUIDANCE_CUE_IDS.hint);
      },
      followStall() {
        setStallVisible(false);
        log("followed", GUIDANCE_CUE_IDS.stall);
        if (!hintOpen && guidance.hintText) {
          setHintOpen(true);
          log("shown", GUIDANCE_CUE_IDS.hint);
        }
      },
      dismissStall() {
        setStallVisible(false);
        log("dismissed", GUIDANCE_CUE_IDS.stall);
      },
    };
  }, [on, guidance.hintText, hintOpen, stallVisible, log]);

  return <GuidanceContext.Provider value={value}>{children}</GuidanceContext.Provider>;
}

/** The guidance state, or null when guidance is off (or outside a provider). */
export function useGuidance(): GuidanceValue | null {
  return useContext(GuidanceContext);
}

/** The "Hint" control and its non-modal panel. Place it in the top toolbar of the condition. */
export function HintControl({ className }: { className?: string }) {
  const g = useGuidance();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const open = !!g?.hintOpen;
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);
  if (!g || !g.hintText) return null;
  const close = () => {
    g.closeHint();
    buttonRef.current?.focus();
  };
  return (
    <div className={cn("relative", className)} data-slot="guidance-hint">
      <Button ref={buttonRef} type="button" variant="ghost" title={GUIDANCE_TEXT.hintLabel} aria-expanded={open} aria-controls={panelId} onClick={() => (open ? close() : g.openHint())} className="min-w-11 px-3 md:px-5">
        <Lightbulb aria-hidden="true" />
        {/* The word shows from 768 px; below that the icon carries the same name (both conditions). */}
        <span className="sr-only md:not-sr-only">{GUIDANCE_TEXT.hintLabel}</span>
      </Button>
      <div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-label={GUIDANCE_TEXT.hintTitle}
        tabIndex={-1}
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
        }}
        className="absolute top-full right-0 z-(--z-drawer) mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-rule-strong bg-ground p-4 text-left text-ink"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-h3 pt-2">{titleCase(GUIDANCE_TEXT.hintTitle)}</h2>
          <Button type="button" variant="ghost" aria-label={`Close the ${GUIDANCE_TEXT.hintTitle.toLowerCase()}`} onClick={close}>
            <X aria-hidden="true" />
            Close
          </Button>
        </div>
        <p className="text-reading mt-2 whitespace-pre-line">{g.hintText}</p>
      </div>
    </div>
  );
}

/** The stall cue (D6). Place it at the bottom right of the condition's view. */
export function StallCue({ className }: { className?: string }) {
  const g = useGuidance();
  if (!g || !g.stallVisible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-slot="guidance-stall"
      className={cn(
        // The alert form (DESIGN.md 9.6, DR-022): a full 1 px boundary, radius 0, no left bar, and a
        // heading line of glyph plus word ("Hint"), identical in both conditions.
        "flex max-w-[min(26rem,calc(100vw-2rem))] items-start gap-3 border border-rule-strong bg-ground py-2 pr-2 pl-4 text-ink",
        // High contrast: the reserved yellow guidance cue (WCAG: #111111 on #FFD400 is 14.4:1).
        "[.a11y-contrast_&]:border-[#111111] [.a11y-contrast_&]:bg-[#FFD400] [.a11y-contrast_&]:text-[#111111]",
        className,
      )}
    >
      <div className="min-w-0 flex-1 py-2">
        <p className="flex items-center gap-2 font-sans text-base leading-6 font-bold">
          <Lightbulb aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
          {GUIDANCE_TEXT.hintTitle}
        </p>
        <p className="text-body mt-1">{GUIDANCE_TEXT.stallCue}</p>
        {g.hintText ? (
          <Button type="button" variant="outline" className="mt-2" onClick={g.followStall}>
            {GUIDANCE_TEXT.stallAction}
          </Button>
        ) : null}
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label={GUIDANCE_TEXT.dismiss} title={GUIDANCE_TEXT.dismiss} onClick={g.dismissStall}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
