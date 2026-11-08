"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { decideConsent } from "@/server/study/actions";

import { FieldErrorText, FormErrorAlert, StudyActions, useStudyFormGuard } from "./action-form";

export function ConsentForm({ consentVersion }: { consentVersion: string }) {
  const [state, action, pending] = useActionState(decideConsent, {});
  const guard = useStudyFormGuard(state, pending);
  const confirmError = state.fieldErrors?.confirm;
  return (
    <form action={action} {...guard} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="consentVersion" value={consentVersion} />
      <div className="flex flex-col gap-2">
        <label
          htmlFor="confirm"
          className="group/opt flex min-h-14 cursor-pointer items-start gap-3 border-y border-line px-3 py-3 hover:bg-vat-2 has-[:checked]:bg-raised-hover"
        >
          <input
            id="confirm"
            name="confirm"
            type="checkbox"
            value="yes"
            className="ie-check mt-0.5"
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? "confirm-error" : undefined}
          />
          <span className="t-b min-w-0 flex-1 text-lime">
            I have read the information above, I understand that I can withdraw at any time, and I agree to take part.
          </span>
          <Check aria-hidden="true" className="invisible mt-1 size-5 shrink-0 stroke-[1.75] text-turmeric group-has-[:checked]/opt:visible" />
        </label>
        <FieldErrorText id="confirm-error" message={confirmError} />
      </div>
      <FormErrorAlert message={state.error} />
      <StudyActions
        back={
          <Button type="submit" name="decision" value="declined" variant="outline" aria-disabled={pending}>
            I do not want to take part
          </Button>
        }
      >
        <Button type="submit" name="decision" value="granted" aria-disabled={pending}>
          I agree to take part
        </Button>
      </StudyActions>
    </form>
  );
}
