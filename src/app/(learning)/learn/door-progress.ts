"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { StageTemplate } from "@/features/process/domain/stage-template";
import { probeGpu, walkthroughCanRender } from "@/features/study/gpu-acceptance";
import { finishLearning, logStageLeft, reportStageEntered, sendStageLeft, type StageRef } from "@/features/study/learning-progress";
import { stopPosition, type StageVisit, type StopPosition } from "@/features/study/stage-coverage";
import { createStopLedger } from "@/features/study/stop-ledger";
import { titleCase } from "@/lib/text/title-case";
import { reportWalkthroughUnavailable, type DeviceCheckResult } from "@/server/study/actions";

export const STUDY_HUB = "/study/session";
export const EXCLUDED_PAGE = "/study/complete?status=excluded";
export const DEMO_EXIT = "/explore";

const RETURNED_NOTICE = "You are back at the first stop the study has not recorded, so that every stop is counted.";
const DELAYED_NOTICE = "Your progress is not reaching the study. It will be sent when the connection returns.";
const FAILURE_UNREPORTED_NOTICE = "The study could not be told about this. Check the connection and reload the page.";
const UNSAVED_NOTICE = "Your progress could not be saved. Check the connection and press the button again.";

export function routeAfterRenderFailure(result: Extract<DeviceCheckResult, { ok: true }>): string {
  return result.outcome === "excluded" ? EXCLUDED_PAGE : STUDY_HUB;
}

export function useRenderFailureReport(studyMode: boolean): { readonly failureNotice: string | null; readonly onRenderFailed: () => void } {
  const router = useRouter();
  const [failureNotice, setFailureNotice] = useState<string | null>(null);
  const onRenderFailed = useCallback(() => {
    if (!studyMode) return;
    reportWalkthroughUnavailable(probeGpu()).then(
      (result) => {
        if (result.ok) router.replace(routeAfterRenderFailure(result));
        else setFailureNotice(result.error);
      },
      () => setFailureNotice(FAILURE_UNREPORTED_NOTICE),
    );
  }, [router, studyMode]);
  useEffect(() => {
    if (studyMode && !walkthroughCanRender(probeGpu())) onRenderFailed();
  }, [onRenderFailed, studyMode]);
  return { failureNotice, onRenderFailed };
}

export interface DoorProgress {
  readonly notice: string | null;
  readonly restore: StopPosition | null;
  readonly enter: (stop: StageRef) => void;
  readonly left: (stop: StageRef, activeMs: number) => void;
  readonly finish: () => Promise<boolean>;
  readonly leave: () => void;
}

export function useDoorProgress(templates: readonly StageTemplate[], studyMode: boolean): DoorProgress {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [delayed, setDelayed] = useState(false);
  const [restore, setRestore] = useState<StopPosition | null>(null);
  const leave = useCallback(() => router.replace(studyMode ? STUDY_HUB : DEMO_EXIT), [router, studyMode]);
  const returnTo = useCallback(
    (visit: StageVisit | undefined | null): boolean => {
      const position = visit ? stopPosition(templates, visit) : null;
      if (position) setRestore(position);
      return position !== null;
    },
    [templates],
  );
  const [ledger] = useState(() =>
    createStopLedger(
      { enter: reportStageEntered, left: sendStageLeft },
      {
        onRefused(expected) {
          if (!returnTo(expected)) {
            leave();
            return;
          }
          setNotice(RETURNED_NOTICE);
        },
        onEnded: leave,
        onDelayed: setDelayed,
      },
    ),
  );

  useEffect(() => {
    ledger.setListening(true);
    return () => ledger.setListening(false);
  }, [ledger]);

  const enter = useCallback((stop: StageRef) => ledger.entered(stop), [ledger]);
  const left = useCallback(
    (stop: StageRef, activeMs: number) => {
      logStageLeft(stop, activeMs);
      ledger.left(stop, activeMs);
    },
    [ledger],
  );
  const finish = useCallback(async () => {
    setNotice(null);
    if (!(await ledger.flush())) {
      setNotice(UNSAVED_NOTICE);
      return false;
    }
    const outcome = await finishLearning();
    if (outcome.ok) {
      router.replace(outcome.next);
      return true;
    }
    if (outcome.reason === "not_learning") {
      leave();
      return true;
    }
    if (outcome.reason === "stages_unvisited") {
      const missing = outcome.unvisited.map((stop) => `${titleCase(stop.traditionKey.replace(/-/g, " "))} ${stop.stageNumber}`).join(", ");
      setNotice(`Some stops are still to visit: ${missing}.`);
      returnTo(outcome.unvisited[0]);
      return false;
    }
    setNotice(UNSAVED_NOTICE);
    return false;
  }, [ledger, leave, returnTo, router]);
  return { notice: notice ?? (delayed ? DELAYED_NOTICE : null), restore, enter, left, finish, leave };
}
