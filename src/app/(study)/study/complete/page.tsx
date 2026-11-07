import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { sessionOutcome } from "@/components/study/session-outcome";
import { StudyStateMessage } from "@/components/study/state-message";
import { STUDY_LINK_CLASS } from "@/components/study/step-footer";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: titleCase("Thank you") };

async function Message({ searchParams }: { searchParams: PageProps<"/study/complete">["searchParams"] }) {
  const { status } = await searchParams;
  const m = sessionOutcome(status);
  return (
    <StudyStateMessage
      id="done-heading"
      title={m.title}
      tone={m.tone}
      live="status"
      action={
        m.known ? undefined : (
          <Link href="/study" className={STUDY_LINK_CLASS}>
            Open the study page
          </Link>
        )
      }
    >
      {m.body}
    </StudyStateMessage>
  );
}

export default function CompletePage({ searchParams }: PageProps<"/study/complete">) {
  return (
    <>
      <PageHeader title="Thank you" />
      <Suspense fallback={null}>
        <Message searchParams={searchParams} />
      </Suspense>
    </>
  );
}
