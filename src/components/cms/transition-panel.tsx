"use client";

/**
 * Review decision form for one entity. The options are computed on the server from the
 * actor's permissions and authorship (availableTransitions); the server re-checks everything.
 * Verifying requires the evidence checklist and a reason, recorded with the decision.
 *
 * Options are full-row 44 px radio labels; the evidence checks are full-row 44 px checkbox labels
 * (DESIGN.md 9.5).
 */
import { useId, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { transitionAction } from "@/server/cms/actions";
import { EVIDENCE_CHECKS } from "@/server/cms/schemas";

import { ActionForm, FieldMessage } from "./action-form";

export interface TransitionOption {
  to: string;
  kind: string;
  label: string;
}

const KIND_HINT: Record<string, string> = {
  submit: "Send to a curator for review.",
  withdraw: "Take it back to draft to keep editing.",
  restore: "Reopen as a draft.",
  verify: "Accept it as correct and fully evidenced.",
  needs_evidence: "Ask for better or additional evidence.",
  reject: "Refuse it (it leaves the review pipeline).",
  reopen: "Send accepted content back to review.",
  archive: "Retire it (kept for provenance, never published again).",
};

/** A full-row radio option: the 20 px control inside a 44 px label (shared with the media review). */
export const OPTION_ROW = "flex min-h-11 cursor-pointer items-start gap-3 border-t border-rule py-2.5 first:border-t-0 has-[:disabled]:cursor-not-allowed has-[:disabled]:text-ink-3";
export const NATIVE_RADIO = "ie-check mt-0.5";

export function TransitionPanel({
  entityKind,
  entityId,
  options,
  blockedVerify,
  problems,
}: {
  entityKind: "tradition" | "concept" | "relationship" | "source";
  entityId: string;
  options: TransitionOption[];
  /** Why the actor cannot verify (e.g. they authored it), shown instead of a verify option. */
  blockedVerify?: string | null;
  /** Citation problems that would block verification. */
  problems?: { code: string; message: string }[];
}) {
  // Nothing is pre-selected: on an item under review the first option is "Withdraw to draft", so a
  // pre-selected option would let a slip of Enter record a decision nobody chose.
  const [to, setTo] = useState<string>("");
  const id = useId();
  const chosen = options.find((o) => o.to === to);
  if (options.length === 0) {
    return <p className="text-body text-ink-2">{blockedVerify ?? "No review action is available to you for this item in its current state."}</p>;
  }
  return (
    <ActionForm
      action={transitionAction}
      submitLabel={chosen ? `Confirm: ${chosen.label}` : "Confirm decision"}
      pendingLabel="Recording decision…"
      submitBlocked={chosen ? null : "Choose a decision first."}
    >
      <input type="hidden" name="entityKind" value={entityKind} />
      <input type="hidden" name="entityId" value={entityId} />
      <fieldset className="flex min-w-0 flex-col">
        <legend className="mb-1 font-sans text-[0.9375rem] leading-5 font-bold text-ink">Decision</legend>
        {options.map((o) => (
          <label key={o.to} className={OPTION_ROW}>
            <input type="radio" name="to" value={o.to} checked={to === o.to} onChange={() => setTo(o.to)} className={NATIVE_RADIO} />
            <span className="text-body">
              <span className="font-medium text-ink">{o.label}</span> <span className="text-ink-2">{KIND_HINT[o.kind]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {blockedVerify ? <p className="text-body text-ink-2">{blockedVerify}</p> : null}
      {chosen?.kind === "verify" ? (
        <fieldset className="flex min-w-0 flex-col rounded-card border border-rule-strong px-3 pb-1">
          <legend className="px-1 font-sans text-[0.9375rem] leading-5 font-bold text-ink">Evidence checked (all required)</legend>
          {problems && problems.length > 0 ? (
            <ul className="list-disc py-2 pl-5 font-sans text-[0.9375rem] leading-5 font-semibold text-danger">
              {problems.map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          ) : null}
          {Object.entries(EVIDENCE_CHECKS).map(([key, label]) => (
            <div key={key} className="flex min-h-11 items-start gap-3 border-t border-rule py-3 first:border-t-0">
              <Checkbox id={`${id}-${key}`} name="evidenceChecked" value={key} />
              <Label htmlFor={`${id}-${key}`} className="text-body font-normal">
                {label}
              </Label>
            </div>
          ))}
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-reason`}>
          Reason {chosen && chosen.kind !== "submit" && chosen.kind !== "withdraw" && chosen.kind !== "restore" ? "(required)" : "(optional)"}
        </Label>
        <Textarea id={`${id}-reason`} name="reason" rows={2} maxLength={2000} aria-describedby={`${id}-reason-error`} />
        <FieldMessage name="reason" id={`${id}-reason-error`} />
      </div>
    </ActionForm>
  );
}
