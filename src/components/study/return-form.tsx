"use client";

import { useActionState } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { returnWithCode, type FormState } from "@/server/study/actions";

import { FormErrorAlert, StudyActions, useStudyFormGuard } from "./action-form";

export function ReturnForm({ study, code }: { study: string; code: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(returnWithCode, {});
  const guard = useStudyFormGuard(state, pending);
  return (
    <>
      <PageHeader title="Return to the study" />
      <form action={action} {...guard} className="flex max-w-[28rem] flex-col gap-6" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="studyCode">Study code</Label>
          <Input id="studyCode" name="studyCode" defaultValue={study} autoComplete="off" autoCapitalize="none" spellCheck={false} required className="t-table font-semibold wrap-anywhere" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="participantCode">Your participant code</Label>
          <Input id="participantCode" name="participantCode" defaultValue={code} autoComplete="off" autoCapitalize="none" spellCheck={false} required className="t-table font-semibold wrap-anywhere" />
        </div>
        <FormErrorAlert message={state.error} />
        <StudyActions>
          <Button type="submit" aria-disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </StudyActions>
      </form>
    </>
  );
}
