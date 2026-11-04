"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { CoursePractice } from "@/features/course/ui/course-practice";
import { endFamiliarisation } from "@/server/study/actions";

const WalkthroughPractice = dynamic(() => import("@/features/walkthrough/ui/walkthrough-practice").then((module) => module.WalkthroughPractice), {
  ssr: false,
  loading: () => <div className="walkthrough walkthrough-loading walking" role="status">Opening The Yard</div>,
});

interface PracticeDoorProps {
  readonly studyMode: boolean;
  readonly returnTo: string;
}

function usePracticeFinish({ studyMode, returnTo }: PracticeDoorProps): { readonly error: string | null; readonly finish: () => void } {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const finish = useCallback(() => {
    if (!studyMode) {
      router.replace(returnTo);
      return;
    }
    void endFamiliarisation({}).then((state) => setError(state?.error ?? null));
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
  return (
    <>
      <WalkthroughPractice onFinished={finish} />
      <PracticeError message={error} />
    </>
  );
}
