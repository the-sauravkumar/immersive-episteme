"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { continueFromEntrance, type FormState } from "@/server/study/actions";

import { FormErrorAlert, StudyActions } from "./action-form";
import { StepFooter } from "./step-footer";

const ENTRANCE_CLOSED = "/walkthrough/stills/entrance-closed.jpg";
const ENTRANCE_HOLD_MS = 3000;

const entranceOpenImage = (door: 1 | 2): string => `/walkthrough/stills/entrance-open${door}.jpg`;

export function EntranceScene({ door }: { door: 1 | 2 }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>((prev) => continueFromEntrance(prev), {});

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), ENTRANCE_HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Entrance" className="mb-0" />
      <div aria-hidden="true" className="pointer-events-none select-none">
        <Image className="walking-entrance" src={open ? entranceOpenImage(door) : ENTRANCE_CLOSED} alt="" width={1920} height={1080} sizes="100vw" priority unoptimized draggable={false} />
      </div>
      <p role="status" aria-live="polite" className="t-l text-lime">
        {open ? `Door ${door} is open.` : "Both doors are shut."}
      </p>
      <FormErrorAlert message={state.error} />
      {open ? (
        <form action={action}>
          <StudyActions>
            <Button type="submit" aria-disabled={pending}>
              {pending ? "Please wait…" : "Continue"}
            </Button>
          </StudyActions>
        </form>
      ) : null}
      <StepFooter />
    </div>
  );
}
