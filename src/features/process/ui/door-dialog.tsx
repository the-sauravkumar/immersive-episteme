"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";

const StudyExit = createContext<string | null>(null);

export function StudyExitProvider({ href, children }: { readonly href: string | null; readonly children: ReactNode }) {
  return <StudyExit.Provider value={href}>{children}</StudyExit.Provider>;
}

export interface DoorDialogProps {
  readonly className: string;
  readonly title: string;
  readonly action: string;
  readonly onClose: () => void;
  readonly offersWithdrawal?: boolean;
  readonly children: ReactNode;
}

export function DoorDialog({ className, title, action, onClose, offersWithdrawal = false, children }: DoorDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const exit = useContext(StudyExit);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className={className} aria-labelledby={titleId} onClose={onClose}>
      <h2 id={titleId}>{title}</h2>
      {children}
      {offersWithdrawal && exit ? (
        <p data-slot="door-withdraw">
          You can stop at any time. <Link href={exit}>Withdraw from the study</Link>
        </p>
      ) : null}
      <button type="button" className="dialog-button" onClick={onClose}>
        {action}
      </button>
    </dialog>
  );
}
