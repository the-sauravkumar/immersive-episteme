"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";

import { continueFromEntrance, type FormState } from "@/server/study/actions";

export const ENTRANCE_CLOSED = "/walkthrough/stills/entrance-closed.jpg";
export const ENTRANCE_HOLD_MS = 3000;

export const entranceOpenImage = (door: 1 | 2): string => `/walkthrough/stills/entrance-open${door}.jpg`;

export function EntranceScene({ door }: { door: 1 | 2 }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>((prev) => continueFromEntrance(prev), {});

  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), ENTRANCE_HOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="walking flex flex-col gap-6 p-4">
      <h1 className="text-[clamp(38px,6vw,64px)] leading-none">Entrance</h1>
      <div aria-hidden="true" className="pointer-events-none select-none">
        <Image className="walking-entrance" src={open ? entranceOpenImage(door) : ENTRANCE_CLOSED} alt="" width={1920} height={1080} sizes="100vw" priority unoptimized draggable={false} />
      </div>
      <p role="status" aria-live="polite" className="text-[22px] leading-[1.4]">
        {open ? `Door ${door} is open.` : "Both doors are shut."}
      </p>
      {state.error ? <p className="walking-error">{state.error}</p> : null}
      {open ? (
        <form action={action}>
          <button type="submit" data-primary="true" className="walking-button" disabled={pending}>
            Continue
          </button>
        </form>
      ) : null}
    </div>
  );
}
