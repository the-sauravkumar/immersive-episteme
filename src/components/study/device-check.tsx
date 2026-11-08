"use client";

import { CircleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { detectSoftwareRenderer, detectWebgl } from "@/features/study/gpu-acceptance";
import { titleCase } from "@/lib/text/title-case";
import { submitDeviceCheck, type DeviceCheckResult } from "@/server/study/actions";

import { StudyActions } from "./action-form";

interface ClientDeviceReport {
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  webglVersion: 1 | 2 | null;
  softwareRenderer: boolean;
  inputDevices: ("mouse" | "keyboard" | "touch")[];
  reducedMotion: boolean;
  highContrast: boolean;
  browserFamily: "chrome" | "edge" | "firefox" | "safari" | "other";
}

function browserFamily(ua: string): ClientDeviceReport["browserFamily"] {
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua)) return "safari";
  return "other";
}

function collectDeviceReport(): ClientDeviceReport {
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
    browserFamily: browserFamily(navigator.userAgent),
  };
}

type View = { kind: "ready" } | { kind: "checking" } | { kind: "result"; result: DeviceCheckResult };

const CHECK_UNSENT = "The check could not reach the study. Check the connection, then check again.";

async function sendDeviceCheck(): Promise<DeviceCheckResult> {
  try {
    return await submitDeviceCheck(collectDeviceReport());
  } catch {
    return { ok: false, error: CHECK_UNSENT };
  }
}

export function DeviceCheck() {
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "ready" });

  const busy = useRef(false);
  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setView({ kind: "checking" });
    const result = await sendDeviceCheck();
    if (result.ok && result.outcome === "passed") {
      router.replace("/study/session");
      return;
    }
    if (result.ok && result.outcome === "excluded") {
      router.replace("/study/complete?status=excluded");
      return;
    }
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
      <section aria-labelledby="browser-title" className="flex flex-col gap-4">
        <h2 id="browser-title" className="t-h4 text-lime">
          {titleCase("Browser check")}
        </h2>
        <p className="t-b max-w-[34rem] text-lime">
          When you continue, a quick check makes sure this browser and window can show the study. It records the window size, the screen density, the input devices, the browser family, its graphics support and whether you have asked for reduced motion or high contrast. It records nothing that names you.
        </p>
        {view.kind === "checking" ? (
          <p role="status" aria-live="polite" className="t-b text-lime-dim">
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
        <Button type="button" aria-disabled={view.kind === "checking"} onClick={() => void run()}>
          {view.kind === "result" ? "Check again" : "Check and continue"}
        </Button>
      </StudyActions>
    </div>
  );
}
