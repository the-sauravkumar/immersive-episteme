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
      <FormErrorAlert message={state.error} />
      <StudyActions>
        <Button type="submit" aria-disabled={pending}>
          {pending ? "Checking…" : "Continue"}
        </Button>
      </StudyActions>
    </form>
  );
}
