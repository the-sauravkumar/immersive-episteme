import type { Metadata } from "next";
import { Suspense } from "react";

import { GateFallback } from "@/components/shell/gate-fallback";
import { PageHeader } from "@/components/shell/page-header";
import { WithdrawForm } from "@/components/study/withdraw-form";
import { titleCase } from "@/lib/text/title-case";
import { getCurrentSession } from "@/server/study/session";

export const metadata: Metadata = { title: titleCase("Withdraw from the study") };

/**
 * Withdrawal at any point of a session. Data already given is kept per the study's retention
 * policy and removed on request or after it (the research team's purge, DR-030); what is kept for
 * the audit record is said plainly.
 */
async function Withdraw() {
  const { state } = await getCurrentSession();
  const days = state.study.protocol.config.retentionDays;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <p className="text-reading max-w-[34rem] text-ink">You can stop taking part at any time without giving a reason. Your session will end now.</p>
        <p className="text-reading max-w-[34rem] text-ink">
          Your answers and records from this session up to now are kept as described in the information you agreed to
          {days ? `, for ${days} days after your participation ends, and then removed` : ""}. If you want them removed sooner, tell the facilitator your participant code{" "}
          <span className="text-id whitespace-nowrap text-ink">{state.participantCode}</span>: the research team then deletes your answers, maps and activity
          records.
        </p>
        <p className="text-reading max-w-[34rem] text-ink">
          Your participant code, your consent decisions and the group you were assigned to are kept, without your name, as the record that the study was run
          correctly.
        </p>
      </div>
      <WithdrawForm />
    </div>
  );
}

/** May block: access is verified against the participant session on the server for every navigation (Next 16 `instant`, "Disabling instant"). */
export const instant = false;

export default function Page() {
  return (
    <>
      <PageHeader title="Withdraw from the study" />
      <Suspense fallback={<GateFallback label="Loading your session…" />}>
        <Withdraw />
      </Suspense>
    </>
  );
}
