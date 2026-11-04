"use client";

import { useActionState } from "react";

import { returnWithCode, type FormState } from "@/server/study/actions";

export function ReturnForm({ study, code }: { study: string; code: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(returnWithCode, {});
  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-[clamp(38px,6vw,64px)] leading-none">Return To The Study</h1>
      <form action={action} className="flex max-w-[28rem] flex-col gap-4">
        <label className="flex flex-col gap-2 text-[18px]">
          Study code
          <input className="walking-field" name="studyCode" defaultValue={study} autoComplete="off" required />
        </label>
        <label className="flex flex-col gap-2 text-[18px]">
          Your participant code
          <input className="walking-field" name="participantCode" defaultValue={code} autoComplete="off" required />
        </label>
        {state.error ? (
          <p role="alert" className="walking-error">
            {state.error}
          </p>
        ) : null}
        <div>
          <button type="submit" data-primary="true" className="walking-button" disabled={pending}>
            Continue
          </button>
        </div>
      </form>
    </section>
  );
}
