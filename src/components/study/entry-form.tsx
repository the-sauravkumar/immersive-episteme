"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enterStudy, type EntryFormState } from "@/server/study/actions";

import { FieldErrorText, FormErrorAlert, StudyActions, useStudyFormGuard } from "./action-form";

export function EntryForm({ defaultCode }: { defaultCode?: string }) {
  const [state, action, pending] = useActionState(enterStudy, {} as EntryFormState);
  const guard = useStudyFormGuard(state, pending);
  const codeError = state.fieldErrors?.studyCode;
  const earlierError = state.fieldErrors?.earlierCode;
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
          className="t-table font-semibold wrap-anywhere"
        />
        <p id="studyCode-hint" className="t-s text-lime-dim max-w-[34rem]">
          The code your facilitator gave you. You will not be asked for your name or email.
        </p>
        <FieldErrorText id="studyCode-error" message={codeError} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="earlierCode">Participant code from an earlier study (optional)</Label>
        <Input
          id="earlierCode"
          name="earlierCode"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={earlierError ? true : undefined}
          aria-describedby={earlierError ? "earlierCode-error earlierCode-hint" : "earlierCode-hint"}
          className="t-table font-semibold wrap-anywhere"
        />
        <p id="earlierCode-hint" className="t-s text-lime-dim max-w-[34rem]">
          Only if you took part in one of our studies before: enter the participant code you were given then, so that you learn something new this time. Leave it empty otherwise.
        </p>
        <FieldErrorText id="earlierCode-error" message={earlierError} />
      </div>
      <FormErrorAlert message={state.error} />
      <StudyActions>
        <Button type="submit" aria-disabled={pending}>
          {pending ? "Checking…" : "Continue"}
        </Button>
      </StudyActions>
    </form>
  );
}
