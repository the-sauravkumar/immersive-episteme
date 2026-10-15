import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { StudyStateMessage } from "@/components/study/state-message";
import { titleCase } from "@/lib/text/title-case";

export const metadata: Metadata = { title: titleCase("Thank you") };

const MESSAGES: Record<string, { title: string; body: string; tone: "done" | "info" }> = {
  completed: {
    title: "Your session is complete",
    body: "Thank you for taking part. Your answers have been recorded. You can close this window.",
    tone: "done",
  },
  declined: {
    title: "You chose not to take part",
    body: "Nothing else will be asked of you. You can close this window.",
    tone: "info",
  },
  withdrawn: {
    title: "You have withdrawn from the study",
    body: "Your withdrawal has been recorded and the session has ended. Answers given before you withdrew are kept as described in the information you were given; ask the facilitator if you have questions about them. You can close this window.",
    tone: "info",
  },
  ended: {
    title: "This session cannot be continued",
    body: "The study does not allow this session to be resumed. Please speak to the facilitator. You can close this window.",
    tone: "info",
  },
  excluded: {
    title: "This study cannot continue on this device",
    body: "Please speak to the facilitator. You can close this window.",
    tone: "info",
  },
};

async function Message({ searchParams }: { searchParams: PageProps<"/study/complete">["searchParams"] }) {
  const { status } = await searchParams;
  const m = (typeof status === "string" && MESSAGES[status]) || MESSAGES.completed!;
  return (
    <StudyStateMessage id="done-heading" title={m.title} tone={m.tone} live="status">
      {m.body}
    </StudyStateMessage>
  );
}

/**
 * Shown after a session ends (or consent is declined): the debrief, in the editorial text measure
 * (DESIGN.md 11.7) with no outbound navigation. Public: the session cookie is already cleared.
 * The h1 is the neutral "Thank You", true for every outcome (a declined consent never started a
 * session); the message heading under it names the outcome.
 */
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
