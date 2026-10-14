/**
 * Shell for the two learning conditions. Deliberately thin and identical in both conditions
 * apart from layout mode, so the shell itself is not an experimental difference:
 *  - "2d": normal document flow with a main landmark.
 *  - "immersive": a fixed, non-scrolling full-viewport root (catalogue §2: the body lock lives
 *    only here, never in globals.css).
 * Decorative motion is forced off (`a11y-reduce-motion`) in both conditions.
 *
 * Participants see no access notice in either condition. Demo and staff-preview visitors see a
 * persistent "not study data" notice.
 */
import type { ReactNode } from "react";

import type { LearningCondition } from "@/lib/permissions/learning";
import { cn } from "@/lib/utils";
import { endPublicDemo } from "@/server/auth/actions";
import type { LearningAccess } from "@/server/auth/learning-access";

export function LearningShell({ condition, children }: { condition: LearningCondition; children: ReactNode }) {
  return (
    <div
      data-condition={condition}
      className={cn(
        "a11y-reduce-motion",
        condition === "immersive"
          ? "immersive-root fixed inset-0 overflow-hidden overscroll-none"
          : "flex min-h-dvh flex-col",
      )}
    >
      <main id="main" tabIndex={-1} className={cn("outline-none", condition === "immersive" ? "h-full w-full" : "flex-1")}>
        {children}
      </main>
    </div>
  );
}

export function AccessNotice({ access }: { access: LearningAccess }) {
  if (access.experimental) return null;
  const text =
    access.kind === "demo"
      ? "Demo: you are exploring outside a study. Nothing here is recorded as study data."
      : "Staff preview: not part of a study session and not recorded as study data.";
  return (
    <aside
      aria-label="Session type"
      className="relative z-(--z-hud) flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary px-4 py-2 text-sm"
    >
      <p>{text}</p>
      {access.kind === "demo" ? (
        <form action={endPublicDemo}>
          <button type="submit" className="min-h-9 rounded-md px-3 underline underline-offset-4 hover:bg-accent">
            End demo
          </button>
        </form>
      ) : null}
    </aside>
  );
}
