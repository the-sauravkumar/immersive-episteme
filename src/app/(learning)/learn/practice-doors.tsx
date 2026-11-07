"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { CoursePractice } from "@/features/course/ui/course-practice";
import { endFamiliarisation } from "@/server/study/actions";

import { useRenderFailureReport } from "./door-progress";

const WalkthroughPractice = dynamic(() => import("./composed-walkthrough").then((module) => module.ComposedWalkthroughPractice), {
  ssr: false,
  loading: () => <div className="walkthrough walkthrough-loading walking" role="status">Opening The Yard</div>,
});

interface PracticeDoorProps {
  readonly studyMode: boolean;
  readonly returnTo: string;
}

export const PRACTICE_UNSENT = "The study could not be told that the practice is over. Check the connection and press the button again.";

export function usePracticeFinish({ studyMode, returnTo }: PracticeDoorProps): { readonly error: string | null; readonly finish: () => void } {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const finish = useCallback(() => {
    if (!studyMode) {
      router.replace(returnTo);
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setError(null);
    endFamiliarisation({}).then(
      (state) => {
        pending.current = false;
        setError(state?.error ?? null);
      },
      () => {
        pending.current = false;
        setError(PRACTICE_UNSENT);
      },
    );
  }, [returnTo, router, studyMode]);
  return { error, finish };
}

function PracticeError({ message }: { readonly message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="walking-toast" data-visible="true">
      {message}
    </div>
  );
}

export function CoursePracticeDoor(props: PracticeDoorProps) {
  const { error, finish } = usePracticeFinish(props);
  return (
    <>
      <CoursePractice onFinished={finish} />
      <PracticeError message={error} />
    </>
  );
}

export function WalkthroughPracticeDoor(props: PracticeDoorProps) {
  const { error, finish } = usePracticeFinish(props);
  const { failureNotice, onRenderFailed } = useRenderFailureReport(props.studyMode);
  return (
    <>
      <WalkthroughPractice onFinished={finish} onRenderFailed={onRenderFailed} />
      <PracticeError message={failureNotice ?? error} />
    </>
  );
}
