import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { ConsentForm } from "@/components/study/consent-form";
import { StudyTeamAndEthics } from "@/components/public/team-and-ethics";
import { StudyDisplayChoice } from "@/components/study/device-check";
import { StudyStateMessage } from "@/components/study/state-message";
import { buttonVariants } from "@/components/ui/button";
import { INSTITUTION } from "@/config/institution";
import { titleCase } from "@/lib/text/title-case";
import { getPool } from "@/server/db/client";
import { loadParticipant, loadStudy } from "@/server/study/engine";
import { readEnrolment } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Information and consent") };

/** The consent and information text column: the editorial 34rem measure, no sidenotes (DESIGN.md 6, 11.7). */
const TEXT = "text-reading max-w-[34rem] whitespace-pre-line text-ink";

function StartAgain({ title, text }: { title: string; text: string }) {
  return (
    <StudyStateMessage
      id="start-again-title"
      title={title}
      action={
        <Link href="/study" className={buttonVariants()}>
          Enter the study code
        </Link>
      }
    >
      {text}
    </StudyStateMessage>
  );
}

/** Information sheet and consent text, verbatim from the study configuration. */
async function Consent() {
  const enrolment = await readEnrolment();
  if (!enrolment) return <StartAgain title="Enrolment not found" text="Your enrolment was not found or has expired." />;
  const pool = getPool();
  const participant = await loadParticipant(pool, enrolment.participantId);
  if (!participant || participant.studyId !== enrolment.studyId) return <StartAgain title="Enrolment not found" text="Your enrolment was not found." />;
  // Granted but not yet allocated (allocation failed): the form is shown again to retry.
  const pendingAllocation = participant.latestConsent?.decision === "granted" && !participant.sessionId;
  if (participant.latestConsent && !pendingAllocation) return <StartAgain title="Decision recorded" text="Your decision has already been recorded." />;
  const study = await loadStudy(pool, enrolment.studyId);
  const consent = study.protocol.config.consent;
  if (!consent) {
    return (
      <StudyStateMessage id="no-consent-title" tone="error" title="Consent cannot be taken now">
        This study cannot take consent at the moment. Please tell the facilitator.
      </StudyStateMessage>
    );
  }
  const info = study.protocol.config.participantInformation;
  // Running text keeps the editorial 34rem measure; the rules, the confirmation row and the action
  // row span the 40rem study column, so the primary action ends at the header's right edge, as on
  // /study and every in-session step.
  // The High contrast accommodation is offered here, once, before the information is read and
  // before the pre-test, so every measured step shares one display (DR-019); the device check
  // shows it read-only. The page is before allocation, so it is the same for every participant.
  return (
    <div className="flex flex-col gap-10">
      <StudyDisplayChoice />
      <section aria-labelledby="study-heading" className="flex flex-col gap-4">
        <h2 id="study-heading" className="text-h2 text-ink">
          {titleCase(study.title)}
        </h2>
        {study.description ? <p className={TEXT}>{study.description}</p> : null}
        {info ? <div className={TEXT}>{info}</div> : null}
        <p className="text-source max-w-[34rem]">
          Your participant code is <span className="text-id whitespace-nowrap text-ink">{participant.code}</span>. It is the only identifier stored with your
          answers.
        </p>
      </section>
      <StudyTeamAndEthics institution={INSTITUTION} />
      <section aria-labelledby="consent-heading" className="flex flex-col gap-4">
        <h2 id="consent-heading" className="text-h2 text-ink">
          {/* The version is an identifier and stays verbatim. */}
          {titleCase("Consent (version")} {consent.version})
        </h2>
        {/* A top rule only: the confirmation row below opens with its own rule, and two parallel
            hairlines around an empty band read as a stray empty row. */}
        <div data-slot="consent-text" className="border-t border-rule pt-6">
          <div className={TEXT}>{consent.text}</div>
        </div>
      </section>
      <ConsentForm consentVersion={consent.version} />
    </div>
  );
}

export default function ConsentPage() {
  return (
    <>
      <PageHeader title="Information and consent" description="Read about the study and decide whether to take part." />
      <Suspense fallback={<GateFallback label="Loading…" />}>
        <Consent />
      </Suspense>
    </>
  );
}
