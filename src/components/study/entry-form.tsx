"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enterStudy } from "@/server/study/actions";

import { FieldErrorText, FormErrorAlert, StudyActions, useStudyFormGuard } from "./action-form";

/**
 * The native select of the stratum, styled with the Input rules (DESIGN.md 9.5): 44 px, 1 px
 * `--rule-strong`, `--surface`, Inter 16 px. A native control keeps the value in the form post.
 */
const NATIVE_SELECT =
  "h-11 w-full min-w-0 rounded-control border border-rule-strong bg-surface px-3 font-sans text-base leading-6 text-ink aria-invalid:border-danger";

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
          className="font-mono"
        />
        <p id="studyCode-hint" className="text-credit max-w-[34rem]">
          The code your facilitator gave you. You will not be asked for your name or email.
        </p>
        <FieldErrorText id="studyCode-error" message={codeError} />
      </div>
      {strata.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="stratum">Group</Label>
          <select id="stratum" name="stratum" required className={NATIVE_SELECT}>
            <option value="">Choose the group the facilitator told you</option>
            {strata.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
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
