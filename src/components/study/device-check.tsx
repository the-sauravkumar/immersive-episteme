"use client";

/**
 * Display and device check: the first page after allocation, the same for both conditions. It
 * takes no condition input at all, so it renders identically whichever condition the participant
 * is allocated to (DESIGN.md 18 WP4).
 *
 *  1. Display (DR-019, DESIGN.md 4.5, 9.19; WP4 task 2 "once"): the High contrast accommodation
 *     is offered ONCE, on the consent page (`StudyDisplayChoice`, the shared Display Settings
 *     dialog in its study form: High contrast only, study mode stays light), before any measured
 *     step. This page shows the value read-only (`StudyDisplayRecord`) and records it on the
 *     session with the check (`study_sessions.device.contrastAccommodation`). Because nothing in
 *     the study can change it after consent, that one stored value is the display of the
 *     pre-test, the learning task and the post-test alike: a participant cannot take the
 *     pre-test in one display and the post-test in another without it being recorded.
 *  2. Browser check: coarse covariates only (no fingerprinting): viewport, pixel ratio, WebGL
 *     availability and version, input types, the reduced-motion and contrast media preferences,
 *     and a browser family. The server applies the study's WebGL-failure policy and minimum
 *     viewport. The check runs when the participant continues, so the display choice is recorded
 *     with it.
 */
import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { readDisplayPreferences } from "@/components/shell/display-preferences";
import { DisplaySettings } from "@/components/shell/display-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { isSoftwareRenderer } from "@/features/study/gpu-acceptance";
import { titleCase } from "@/lib/text/title-case";
import { submitDeviceCheck, type DeviceCheckResult } from "@/server/study/actions";

import { StudyActions } from "./action-form";

export interface ClientDeviceReport {
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  webglVersion: 1 | 2 | null;
  /** True when WebGL runs on a software rasteriser (only this flag is sent, never the renderer string). */
  softwareRenderer: boolean;
  inputDevices: ("mouse" | "keyboard" | "touch")[];
  reducedMotion: boolean;
  highContrast: boolean;
  /** The High contrast accommodation chosen in Display Settings (DR-019). */
  contrastAccommodation: boolean;
  browserFamily: "chrome" | "edge" | "firefox" | "safari" | "other";
}

export function detectWebgl(doc: Document = document): 1 | 2 | null {
  try {
    const canvas = doc.createElement("canvas");
    if (canvas.getContext("webgl2")) return 2;
    if (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) return 1;
  } catch {
    /* a throwing getContext means no WebGL */
  }
  return null;
}

/**
 * Does WebGL run on a software rasteriser? The same test as the museum's probe
 * (@/features/study/gpu-acceptance), so the check refuses what the museum would refuse.
 */
export function detectSoftwareRenderer(doc: Document = document): boolean {
  try {
    const canvas = doc.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return isSoftwareRenderer(renderer);
  } catch {
    return false;
  }
}

function browserFamily(ua: string): ClientDeviceReport["browserFamily"] {
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

export function collectDeviceReport(): ClientDeviceReport {
  const mq = (q: string) => typeof window.matchMedia === "function" && window.matchMedia(q).matches;
  const inputs: ClientDeviceReport["inputDevices"] = ["keyboard"];
  if (mq("(any-pointer: fine)")) inputs.push("mouse");
  if (mq("(any-pointer: coarse)") || navigator.maxTouchPoints > 0) inputs.push("touch");
  return {
    viewport: { width: Math.max(1, Math.round(window.innerWidth)), height: Math.max(1, Math.round(window.innerHeight)) },
    devicePixelRatio: Math.min(8, Math.max(0.1, window.devicePixelRatio || 1)),
    webglVersion: detectWebgl(),
    softwareRenderer: detectSoftwareRenderer(),
    inputDevices: inputs,
    reducedMotion: mq("(prefers-reduced-motion: reduce)"),
    highContrast: mq("(prefers-contrast: more)") || mq("(forced-colors: active)"),
    contrastAccommodation: readDisplayPreferences().contrast,
    browserFamily: browserFamily(navigator.userAgent),
  };
}

// The stored choice is read from localStorage on the client only; the server renders "Off" and
// the client corrects it on hydration without a mismatch warning.
const noSubscribe = () => () => undefined;
const storedContrast = () => readDisplayPreferences().contrast;
const serverContrast = () => false;

type View = { kind: "ready" } | { kind: "checking" } | { kind: "result"; result: DeviceCheckResult };

/** The High contrast state in words (one ruled `<dl>` row), shared by the choice and the record. */
function ContrastState({ on }: { on: boolean }) {
  return (
    <dl className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-x-4 border-y border-rule py-3">
      <dt className="text-label">High contrast</dt>
      <dd className="text-value" data-slot="study-contrast-state">
        {on ? "On" : "Off"}
      </dd>
    </dl>
  );
}

/**
 * The study's one display choice (consent page, before any measurement): one sentence, the
 * current High contrast state in words and the study form of Display Settings. It takes no
 * condition input and is shown before allocation, so it is the same for every participant.
 */
export function StudyDisplayChoice() {
  const stored = useSyncExternalStore(noSubscribe, storedContrast, serverContrast);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const contrast = chosen ?? stored;
  return (
    <section aria-labelledby="display-title" data-slot="study-display-step" className="flex flex-col gap-4">
      <h2 id="display-title" className="text-h2 text-ink">
        {titleCase("Display")}
      </h2>
      <p className="text-reading max-w-[34rem] text-ink">
        If text or borders are hard to see, turn on high contrast in Display settings. Choose now: it then stays the same on every page
        of the study.
      </p>
      <ContrastState on={contrast} />
      <div>
        <DisplaySettings zone="study" onChange={(prefs) => setChosen(prefs.contrast)} />
      </div>
    </section>
  );
}

/**
 * The display as chosen on the consent page, read-only (the display and browser check). The
 * value shown is the value recorded with the check.
 */
export function StudyDisplayRecord() {
  const contrast = useSyncExternalStore(noSubscribe, storedContrast, serverContrast);
  return (
    <section aria-labelledby="display-title" data-slot="study-display-record" className="flex flex-col gap-4">
      <h2 id="display-title" className="text-h2 text-ink">
        {titleCase("Display")}
      </h2>
      <p className="text-reading max-w-[34rem] text-ink">
        You chose the display before the study began. It stays the same for the rest of the study. If you cannot read the pages, tell
        the facilitator.
      </p>
      <ContrastState on={contrast} />
    </section>
  );
}

export function DeviceCheck() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "ready" });

  const busy = useRef(false);
  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setView({ kind: "checking" });
    const result = await submitDeviceCheck(collectDeviceReport());
    if (result.ok && (result.outcome === "passed" || result.outcome === "reassigned")) {
      router.replace("/study/session");
      return;
    }
    if (result.ok && result.outcome === "excluded") {
      router.replace("/study/complete?status=excluded");
      return;
    }
    // A refused check: the button stays where the participant pressed it, now "Check again".
    busy.current = false;
    setView({ kind: "result", result });
  }, [router]);

  const failure =
    view.kind !== "result"
      ? null
      : !view.result.ok
        ? view.result.error
        : view.result.reason === "viewport_too_small"
          ? `The browser window is too small for this study${view.result.minViewport ? ` (at least ${view.result.minViewport.width} × ${view.result.minViewport.height} pixels)` : ""}. Make the window larger or full screen, then check again.`
          : "This browser cannot show the learning environment used in this study. Please tell the facilitator, then check again.";

  return (
    <div className="flex flex-col gap-10">
      <StudyDisplayRecord />
      <section aria-labelledby="browser-title" className="flex flex-col gap-4">
        <h2 id="browser-title" className="text-h2 text-ink">
          {titleCase("Browser check")}
        </h2>
        <p className="text-reading max-w-[34rem] text-ink">
          When you continue, a quick check makes sure this browser and window can show the study. Nothing about you is collected.
        </p>
        {view.kind === "checking" ? (
          <p role="status" aria-live="polite" className="text-reading text-ink-2">
            Checking this browser…
          </p>
        ) : null}
        {failure ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{failure}</AlertDescription>
          </Alert>
        ) : null}
      </section>
      <StudyActions>
        {/* aria-disabled, not disabled: the focused button keeps focus while the check runs
            (WCAG 2.4.3; DESIGN.md 9.1), and run() ignores a second press. */}
        <Button type="button" aria-disabled={view.kind === "checking"} onClick={() => void run()}>
          {view.kind === "result" ? "Check again" : "Check and continue"}
        </Button>
      </StudyActions>
    </div>
  );
}
