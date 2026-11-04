"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { finishLearning, reportStageEntered, type StageRef } from "@/features/study/learning-progress";
import { titleCase } from "@/lib/text/title-case";

export const STUDY_HUB = "/study/session";

export type EntryVerdict = "admitted" | "refused" | "ended";

export async function enterStop(stop: StageRef): Promise<EntryVerdict> {
  const outcome = await reportStageEntered(stop);
  if (outcome.ok) return "admitted";
  if (outcome.reason === "stop_ahead") return "refused";
  return outcome.reason === "not_learning" ? "ended" : "admitted";
}

export function useLearningExit(): { readonly notice: string | null; readonly finish: () => Promise<void>; readonly leave: () => void } {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const leave = useCallback(() => router.replace(STUDY_HUB), [router]);
  const finish = useCallback(async () => {
    const outcome = await finishLearning();
    if (outcome.ok) {
      router.replace(outcome.next);
      return;
    }
    if (outcome.reason === "not_learning") {
      leave();
      return;
    }
    if (outcome.reason === "stages_unvisited") {
      const missing = outcome.unvisited.map((stop) => `${titleCase(stop.traditionKey.replace(/-/g, " "))} ${stop.stageNumber}`).join(", ");
      setNotice(`Some stops are still to visit: ${missing}.`);
      return;
    }
    setNotice("Your progress could not be saved. Check the connection and press the button again.");
  }, [leave, router]);
  return { notice, finish, leave };
}
