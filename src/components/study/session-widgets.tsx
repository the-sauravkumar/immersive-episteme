"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useTelemetry } from "@/features/telemetry/client";
import { finishSession, type FormState } from "@/server/study/actions";

import { FormErrorAlert, StudyActions, useStudyFormGuard } from "./action-form";
import { STUDY_LINK_CLASS } from "./step-footer";

/**
 * Final confirmation. SESSION_COMPLETED is `session_ended` with reason `completed`, emitted and
 * flushed BEFORE the server marks the session completed (the database refuses events stamped
 * after a session ended).
 */
export function FinishForm() {
  const t = useTelemetry();
  const [state, action, pending] = useActionState(async (prev: FormState) => {
    await t.sessionEnded({ metadata: { reason: "completed" }, roomOrPageId: "study:finish" });
    await t.flush();
    return finishSession(prev);
  }, {});
  // The button keeps focus while pending and after a refusal (aria-disabled, not disabled).
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

/**
 * Full-page navigation to a Route Handler (e.g. /study/allocate, which re-issues the session
 * cookie): a client-side RSC navigation cannot follow a Route Handler's redirect.
 */
export function FullPageRedirect({ href, label }: { href: string; label: string }) {
  useEffect(() => {
    window.location.replace(href);
  }, [href]);
  return (
    <p role="status" className="text-reading flex flex-wrap items-center gap-x-2 text-ink">
      {label}
      <a href={href} className={STUDY_LINK_CLASS}>
        Continue
      </a>
    </p>
  );
}
