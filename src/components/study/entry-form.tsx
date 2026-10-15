"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enterStudy } from "@/server/study/actions";

import { FieldErrorText, FormErrorAlert, StudyActions, useStudyFormGuard } from "./action-form";
import { OptionRow, Radio } from "@/components/ui/checkbox";

/**
 * Study code entry. `strata` is shown only for a stratified study reached with ?code=.
 *
 * Width: the form and its action row span the 40rem study column, so "Continue" ends at the same
 * x as the header's "Study" eyebrow, as on consent and every in-session step; running text keeps
 * the 34rem measure. Focus: see useStudyFormGuard (an empty code moves focus back to the field).
 */
export function EntryForm({ defaultCode, strata }: { defaultCode?: string; strata: string[] }) {
  const [state, action, pending] = useActionState(enterStudy, {});
  const guard = useStudyFormGuard(state, pending);
  const codeError = state.fieldErrors?.studyCode;
  return (
    <form action={action} {...guard} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="studyCode">Study code</Label>
        <Input
          id="studyCode"
          name="studyCode"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={defaultCode}
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? "studyCode-error studyCode-hint" : "studyCode-hint"}
          className="text-id"
        />
        <p id="studyCode-hint" className="text-credit max-w-[34rem]">
          The code your facilitator gave you. You will not be asked for your name or email.
        </p>
        <FieldErrorText id="studyCode-error" message={codeError} />
      </div>
      {strata.length > 0 ? (
        // The group as a radio list of full-row 56 px options (DESIGN.md 9.2, 9.6): every option
        // visible at once, native radios, the form post unchanged (name="stratum").
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 font-sans text-[0.9375rem] leading-5 font-bold text-ink">Group</legend>
          <p className="text-credit -mt-1 mb-1">Choose the group the facilitator told you.</p>
          {strata.map((s) => (
            <OptionRow key={s} className="min-h-14">
              <Radio name="stratum" value={s} required />
              <span className="text-body">{s}</span>
            </OptionRow>
          ))}
        </fieldset>
      ) : null}
      <FormErrorAlert message={state.error} />
      <StudyActions>
        <Button type="submit" aria-disabled={pending}>
          {pending ? "Checking…" : "Continue"}
        </Button>
      </StudyActions>
    </form>
  );
}
