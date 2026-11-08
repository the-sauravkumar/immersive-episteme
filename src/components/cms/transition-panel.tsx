"use client";

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

const OPTION_ROW = "flex min-h-11 cursor-pointer items-start gap-3 border-t border-line py-2.5 first:border-t-0 has-[:disabled]:cursor-not-allowed has-[:disabled]:text-lime-dim";
const NATIVE_RADIO = "ie-check mt-0.5";

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
  blockedVerify?: string | null;
  problems?: { code: string; message: string }[];
}) {
  const [to, setTo] = useState<string>("");
  const id = useId();
  const chosen = options.find((o) => o.to === to);
  if (options.length === 0) {
    return <p className="t-b text-lime-dim">{blockedVerify ?? "No review action is available to you for this item in its current state."}</p>;
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
        <legend className="mb-1 t-label text-lime">Decision</legend>
        {options.map((o) => (
          <label key={o.to} className={OPTION_ROW}>
            <input type="radio" name="to" value={o.to} checked={to === o.to} onChange={() => setTo(o.to)} className={NATIVE_RADIO} />
            <span className="t-b">
              <span className="font-medium text-lime">{o.label}</span> <span className="text-lime-dim">{KIND_HINT[o.kind]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {blockedVerify ? <p className="t-b text-lime-dim">{blockedVerify}</p> : null}
      {chosen?.kind === "verify" ? (
        <fieldset className="flex min-w-0 flex-col border border-lime-dim px-3 pb-1">
          <legend className="px-1 t-label text-lime">Evidence checked (all required)</legend>
          {problems && problems.length > 0 ? (
            <ul className="list-disc py-2 pl-5 t-s font-semibold text-madder-text">
              {problems.map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          ) : null}
          {Object.entries(EVIDENCE_CHECKS).map(([key, label]) => (
            <div key={key} className="flex min-h-11 items-start gap-3 border-t border-line py-3 first:border-t-0">
              <Checkbox id={`${id}-${key}`} name="evidenceChecked" value={key} />
              <Label htmlFor={`${id}-${key}`} className="t-b font-normal">
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
