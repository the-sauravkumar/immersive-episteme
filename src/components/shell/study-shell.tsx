/**
 * Study flow shell (/study/*): minimal and calm. No decorative motion, no outbound navigation
 * that could pull a participant out of the protocol, one main landmark.
 */
import type { ReactNode } from "react";

export function StudyShell({ children }: { children: ReactNode }) {
  return (
    <div className="a11y-reduce-motion flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <p className="font-display text-xl font-medium">Immersive Episteme</p>
          <p className="kicker">Study</p>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-6 py-10 outline-none">
        {children}
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto max-w-3xl px-6 py-4 text-sm text-muted-foreground">
          If anything is unclear, ask the study facilitator.
        </p>
      </footer>
    </div>
  );
}
