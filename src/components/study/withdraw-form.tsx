"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { titleCase } from "@/lib/text/title-case";
import { withdrawFromStudy } from "@/server/study/actions";

import { FieldErrorText, FormErrorAlert, StudyActions, useStudyFormGuard } from "./action-form";

const REASONS: { value: string; label: string }[] = [
  { value: "not_stated", label: "I prefer not to say" },
  { value: "no_longer_wish_to_take_part", label: "I no longer wish to take part" },
  { value: "no_time", label: "I do not have time to finish" },
  { value: "technical_problem", label: "Technical problems" },
  { value: "felt_unwell", label: "I do not feel well" },
];

const ROW = "group/opt flex min-h-14 cursor-pointer items-center gap-3 px-3 py-3 hover:bg-vat-2 has-[:checked]:bg-raised-hover";

function RowCheck() {
  return <Check aria-hidden="true" className="invisible size-5 shrink-0 stroke-[1.75] text-turmeric group-has-[:checked]/opt:visible" />;
}

export function WithdrawForm() {
  const [state, action, pending] = useActionState(withdrawFromStudy, {});
  const guard = useStudyFormGuard(state, pending);
  const confirmError = state.fieldErrors?.confirm;
  return (
    <form action={action} {...guard} className="flex flex-col gap-8" noValidate>
      <fieldset className="flex min-w-0 flex-col gap-4">
        <legend className="t-label mb-4 text-lime">{titleCase("Reason (optional)")}</legend>
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {REASONS.map((r) => (
            <label key={r.value} htmlFor={`reason-${r.value}`} className={ROW}>
              <input
                id={`reason-${r.value}`}
                type="radio"
                name="reason"
                value={r.value}
                defaultChecked={r.value === "not_stated"}
                className="ie-check"
              />
              <span className="t-b min-w-0 flex-1 text-lime">{r.label}</span>
              <RowCheck />
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="t-label mb-4 text-lime">{titleCase("Confirm withdrawal")}</legend>
        <label htmlFor="confirm" className={`${ROW} border-y border-y-line`}>
          <input
            id="confirm"
            name="confirm"
            type="checkbox"
            value="yes"
            className="ie-check"
            aria-describedby={confirmError ? "confirm-error" : undefined}
            aria-invalid={confirmError ? true : undefined}
          />
          <span className="t-b min-w-0 flex-1 text-lime">I want to withdraw from the study now.</span>
          <RowCheck />
        </label>
        <FieldErrorText id="confirm-error" message={confirmError} />
      </fieldset>
      <FormErrorAlert message={state.error} />
      <StudyActions
        back={
          <Button asChild variant="outline">
            <Link href="/study/session">Go back to the study</Link>
          </Button>
        }
      >
        <Button type="submit" variant="destructive" aria-disabled={pending}>
          {pending ? "Withdrawing…" : "Withdraw from the study"}
        </Button>
      </StudyActions>
    </form>
  );
}
