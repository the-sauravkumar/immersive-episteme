import { Info } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { ActionForm } from "@/components/study/action-form";
import { EntryForm } from "@/components/study/entry-form";
import { STUDY_LINK_CLASS } from "@/components/study/step-footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { serverEnv } from "@/lib/env";
import { titleCase } from "@/lib/text/title-case";
import { PARTICIPANT_COOKIE } from "@/server/auth/cookie-names";
import { resolveParticipantSession } from "@/server/auth/learning-decision";
import { getStudySessionLookup } from "@/server/auth/study-session-port";
import { getPool } from "@/server/db/client";
import { resumeStudy } from "@/server/study/actions";
import { findEnrollableStudy, StudyEngineError } from "@/server/study/engine";

export const metadata: Metadata = { title: titleCase("Take part in a study") };

const REASONS: Record<string, string> = {
  "invalid-session": "Your study session could not be verified. Please ask the facilitator for help.",
  "session-ended": "This study session has ended. Thank you for taking part.",
  "enrolment-expired": "Your enrolment expired before you made a decision. Please enter the study code again.",
};

async function Entry({ searchParams }: { searchParams: PageProps<"/study">["searchParams"] }) {
  const { reason, code } = await searchParams;
  const message = typeof reason === "string" ? REASONS[reason] : undefined;

  const cookie = (await cookies()).get(PARTICIPANT_COOKIE)?.value;
  const live = cookie
    ? await resolveParticipantSession(cookie, { secret: serverEnv().BETTER_AUTH_SECRET, lookup: getStudySessionLookup() })
    : null;
  if (live?.allowed) {
    return (
      <section aria-labelledby="resume-heading" className="flex flex-col gap-4">
        <h2 id="resume-heading" className="text-h2 text-ink">
          {titleCase("You have a study session in progress")}
        </h2>
        <p className="text-reading max-w-[34rem] text-ink">Continue where you stopped. The break is recorded with your session.</p>
        <ActionForm
          action={resumeStudy}
          submitLabel="Continue your session"
          back={
            <Link href="/study/withdraw" className={STUDY_LINK_CLASS}>
              Withdraw from the study
            </Link>
          }
        />
      </section>
    );
  }

  // A link with ?code= can show the study's groups (stratified allocation) before enrolment.
  let strata: string[] = [];
  const defaultCode = typeof code === "string" ? code.slice(0, 120) : undefined;
  if (defaultCode) {
    try {
      const study = await findEnrollableStudy(getPool(), defaultCode);
      strata = study.protocol.config.allocation.algorithm === "stratified_block" ? study.strata : [];
    } catch (err) {
      if (!(err instanceof StudyEngineError)) throw err;
    }
  }
  // The full 40rem study column, so the note, the field and the action row end at the header's
  // right edge, as on consent and every in-session step; running text keeps the 34rem measure.
  return (
    <div className="flex flex-col gap-8">
      {message ? (
        <Alert variant="info" role="status">
          <Info aria-hidden="true" />
          <AlertTitle>Note</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <EntryForm defaultCode={defaultCode} strata={strata} />
    </div>
  );
}

/**
 * Study entry: participants join with the study code from the facilitator. Deliberately no link
 * to the public demo (/explore): the demo shows both conditions, and this page is where
 * prospective participants land. A browser with a live session is offered "continue" instead.
 */
export default function StudyEntryPage({ searchParams }: PageProps<"/study">) {
  return (
    <>
      <PageHeader title="Take part in a study" description="Use the study code your facilitator gave you. You do not need an account." />
      <Suspense fallback={<GateFallback label="Loading…" />}>
        <Entry searchParams={searchParams} />
      </Suspense>
    </>
  );
}
