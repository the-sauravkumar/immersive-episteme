"use client";

/**
 * Display Settings (DESIGN.md 4.5, 9.19; DR-019).
 *
 * One dialog, the same component in every placement (public footer, console user menu, study
 * onboarding). Three labelled 44 px switches: Dark theme, High contrast, Reduce motion. In the
 * study zone ONLY the High contrast switch is shown: study mode is light in both conditions, and
 * reduce motion is moot there (no motion). The choice is written as classes on <html> and kept
 * per device in localStorage (guarded, see display-preferences.ts). In study the study engine
 * records the High contrast choice on the session through `onChange` (DR-019), so no telemetry
 * event type is involved here.
 *
 * <DisplayPreferencesSync> is mounted by every shell and keeps <html> in step with the zone on
 * client navigation (for example forcing light when a dark-theme visitor enters a study route).
 */
import { MonitorCog } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useId, useLayoutEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import {
  DISPLAY_STORAGE_KEY,
  STUDY_GUARD_GLOBAL,
  THEME_STORAGE_KEY,
  applyDisplayClasses,
  readDisplayPreferences,
  readStoredTheme,
  writeDisplayPreferences,
  type DisplayZone,
  type StoredDisplayPreferences,
} from "./display-preferences";

/** All three choices as the dialog shows them. `dark` is always false in the study zone. */
export interface DisplayPreferences extends StoredDisplayPreferences {
  dark: boolean;
}

// useLayoutEffect warns during server rendering; the effect only matters in the browser.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Keeps <html> in step with the zone. Mounted once by each shell. In the study zone it also
 * watches the class attribute while mounted and strips `dark` if anything (next-themes after a
 * storage event, a stale tab) adds it back, so a study page is never dark in either condition.
 */
export function DisplayPreferencesSync({ zone }: { zone: DisplayZone }) {
  useIsomorphicLayoutEffect(() => {
    const w = window as unknown as Record<string, MutationObserver | undefined>;
    w[STUDY_GUARD_GLOBAL]?.disconnect();
    w[STUDY_GUARD_GLOBAL] = undefined;

    applyDisplayClasses(zone);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === THEME_STORAGE_KEY || event.key === DISPLAY_STORAGE_KEY) applyDisplayClasses(zone);
    };
    window.addEventListener("storage", onStorage);

    let observer: MutationObserver | null = null;
    if (zone === "study") {
      const html = document.documentElement;
      observer = new MutationObserver(() => {
        if (html.classList.contains("dark")) applyDisplayClasses("study");
      });
      observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    }
    return () => {
      window.removeEventListener("storage", onStorage);
      observer?.disconnect();
      // Leaving a study route: give the stored theme back. The next shell's sync re-applies its
      // own zone right after (unmount effects run before mount effects in one commit).
      if (zone === "study") applyDisplayClasses("public");
    };
  }, [zone]);
  return null;
}

function Switch({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  const labelId = useId();
  const descId = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 border-b border-rule py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col">
        <span id={labelId} className="text-ui text-ink">
          {label}
        </span>
        <span id={descId} className="text-credit">
          {description}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        data-slot="display-switch"
        onClick={() => onCheckedChange(!checked)}
        className="group/switch inline-flex min-h-11 shrink-0 items-center gap-3 rounded-control px-2 text-ui text-ink hover:bg-sunk"
      >
        {/* The word carries the state; the track is a second, non-colour-only cue (R-A4). */}
        <span className="w-7 text-left tabular-nums" aria-hidden="true">
          {checked ? "On" : "Off"}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "relative inline-block h-6 w-11 rounded-control border",
            checked ? "border-indigo bg-indigo" : "border-rule-strong bg-ground",
          )}
        >
          <span
            className={cn(
              "absolute top-1/2 size-4 -translate-y-1/2 rounded-[2px]",
              checked ? "right-[3px] bg-on-indigo" : "left-[3px] border border-rule-strong bg-ink-3",
            )}
          />
        </span>
      </button>
    </div>
  );
}

/** The switches. Mounted only while the dialog is open, so it reads the stored choice afresh each time. */
function DisplaySettingsPanel({ zone, onChange }: { zone: DisplayZone; onChange?: (prefs: DisplayPreferences) => void }) {
  const { setTheme } = useTheme();
  const [prefs, setPrefs] = useState<DisplayPreferences>(() => ({
    ...readDisplayPreferences(),
    dark: zone !== "study" && readStoredTheme() === "dark",
  }));

  function update(patch: Partial<DisplayPreferences>) {
    const next = { ...prefs, ...patch };
    if (zone === "study") next.dark = false;
    setPrefs(next);
    writeDisplayPreferences({ contrast: next.contrast, reduceMotion: next.reduceMotion });
    // next-themes stores the theme synchronously and applies its class in an effect; the zone's
    // classes are applied now as well, so the page changes on the same frame as the switch.
    if (zone !== "study" && patch.dark !== undefined) setTheme(next.dark ? "dark" : "light");
    applyDisplayClasses(zone, { contrast: next.contrast, reduceMotion: next.reduceMotion });
    onChange?.(next);
  }

  return (
    <div className="flex flex-col">
      {zone === "study" ? null : (
        <Switch label="Dark theme" description="Light text on a dark ground." checked={prefs.dark} onCheckedChange={(dark) => update({ dark })} />
      )}
      <Switch
        label="High contrast"
        description="Darker text, solid borders, no decorative patterns."
        checked={prefs.contrast}
        onCheckedChange={(contrast) => update({ contrast })}
      />
      {zone === "study" ? null : (
        <Switch
          label="Reduce motion"
          description="Turns off fades and the one diagram animation."
          checked={prefs.reduceMotion}
          onCheckedChange={(reduceMotion) => update({ reduceMotion })}
        />
      )}
    </div>
  );
}

/**
 * The dialog. Uncontrolled by default with its own trigger button; pass `open`/`onOpenChange`
 * (and `trigger={null}`) to open it from elsewhere, such as the console user menu.
 */
export function DisplaySettings({
  zone,
  onChange,
  open,
  onOpenChange,
  trigger,
  triggerVariant = "outline",
  triggerClassName,
}: {
  zone: DisplayZone;
  /** Called after every change with the full current choice (the study engine records it). */
  onChange?: (prefs: DisplayPreferences) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom trigger; `null` renders none (controlled use). Defaults to a 44 px "Display settings" button. */
  trigger?: ReactNode | null;
  triggerVariant?: "outline" | "ghost" | "link";
  triggerClassName?: string;
}) {
  const defaultTrigger = (
    <Button type="button" variant={triggerVariant} className={triggerClassName}>
      <MonitorCog aria-hidden="true" />
      Display settings
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger === null ? null : <DialogTrigger asChild>{trigger ?? defaultTrigger}</DialogTrigger>}
      <DialogContent data-slot="display-settings" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Display Settings</DialogTitle>
          <DialogDescription>
            {zone === "study"
              ? "High contrast makes text and borders darker. It applies to every page of the study."
              : "Saved on this device only."}
          </DialogDescription>
        </DialogHeader>
        <DisplaySettingsPanel zone={zone} onChange={onChange} />
      </DialogContent>
    </Dialog>
  );
}
