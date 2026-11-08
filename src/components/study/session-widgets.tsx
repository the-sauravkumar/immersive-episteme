"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useTelemetry } from "@/features/telemetry/client";
import { finishSession, type FormState } from "@/server/study/actions";

import { FormErrorAlert, StudyActions, useStudyFormGuard } from "./action-form";
import { STUDY_LINK_CLASS } from "./step-footer";

export function FinishForm() {
  const t = useTelemetry();
  const [state, action, pending] = useActionState(async (prev: FormState) => {
    await t.sessionEnded({ metadata: { reason: "completed" }, roomOrPageId: "study:finish" });
    const { pending: undelivered } = await t.flushNow();
    return finishSession(prev, undelivered);
  }, {});
  const guard = useStudyFormGuard(state, pending);
  return (
    <form action={action} {...guard} className="flex flex-col gap-6">
      <FormErrorAlert message={state.error} />
      <StudyActions>
        <Button type="submit" aria-disabled={pending}>
          {pending ? "Finishing…" : "Finish and submit"}
        </Button>
      </StudyActions>
    </form>
  );
}

export function FullPageRedirect({ href, label }: { href: string; label: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return (
    <p role="status" className="t-b flex flex-wrap items-center gap-x-2 text-lime">
      {label}
      <a href={href} className={STUDY_LINK_CLASS}>
        Continue
      </a>
    </p>
  );
}
