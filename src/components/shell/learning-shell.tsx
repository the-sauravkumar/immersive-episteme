/**
 * Shell for the two learning conditions. Deliberately thin and identical in both conditions
 * apart from layout mode, so the shell itself is not an experimental difference:
 *  - "2d": normal document flow with a main landmark.
 *  - "immersive": a fixed, non-scrolling full-viewport root (catalogue §2: the body lock lives
 *    only here, never in globals.css).
 *
 * Study mode (DESIGN.md 3, 8, 12.2; DR-019), the same in both conditions:
 *  - zero motion: `a11y-reduce-motion` here, plus the global `[data-condition]` zero-motion and
 *    `font-synthesis: none` rules in globals.css;
 *  - the light theme is forced and only the High contrast accommodation applies
 *    (<DisplayPreferencesSync zone="study">), so the classes on <html> are the same in both;
 *  - `--notice-offset` is the AccessNotice height when the notice is present and 0 otherwise, so
 *    the sticky StudyBar can sit directly under it (`top: var(--notice-offset)`) in both.
 *
 * Participants see no access notice in either condition. Demo and staff-preview visitors see a
 * persistent "not study data" notice, in the same slot and at the same height in both.
 */
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ACCESS_NOTICE_TEXT } from "@/features/learning/strings";
import type { LearningCondition } from "@/lib/permissions/learning";
import { cn } from "@/lib/utils";
import { endPublicDemo } from "@/server/auth/actions";
import type { LearningAccess } from "@/server/auth/learning-access";

import { DisplayPreferencesSync } from "./display-settings";

export function LearningShell({ condition, children }: { condition: LearningCondition; children: ReactNode }) {
  return (
    <div
      data-condition={condition}
      data-zone="study"
      className={cn(
        // --notice-offset: 0 here; globals.css sets it to --notice-h while a notice strip is present.
        "a11y-reduce-motion bg-ground [--notice-offset:0px]",
        condition === "immersive"
          ? "immersive-root fixed inset-0 overflow-hidden overscroll-none"
          : "flex min-h-dvh flex-col",
      )}
    >
      <DisplayPreferencesSync zone="study" />
      <main id="main" tabIndex={-1} className={cn("outline-none", condition === "immersive" ? "flex h-full w-full flex-col" : "flex-1")}>
        {children}
      </main>
    </div>
  );
}

function NoticeWords({ text, variant }: { text: { long: string; medium: string; short: string }; variant: "plain" | "review" }) {
  return (
    <p className="min-w-0 truncate" data-notice-variant={variant}>
      <span className="xs:hidden">{text.short}</span>
      <span className="hidden xs:inline lg:hidden">{text.medium}</span>
      <span className="hidden lg:inline">{text.long}</span>
    </p>
  );
}

/**
 * AccessNotice (DESIGN.md 9.15): the demo, staff-preview and "under review" notices as ONE 40 px
 * strip (`--notice-h`) on `--sunk` in `text-ui`, sticky at the top, rendered in the same slot above
 * the StudyBar in both conditions, with an "End demo" 44 px ghost button for demo visitors.
 * Participants (experimental access) see none in either condition.
 *
 * The merge with the "under review" notice is CSS (globals.css, "AccessNotice merge"): the
 * condition renders its UnverifiedContentNotice when the snapshot holds unverified content; while
 * an AccessNotice is present that strip is hidden and this strip shows its `review` wording. A
 * participant on unverified content sees only the UnverifiedContentNotice strip, in this slot.
 */
export function AccessNotice({ access }: { access: LearningAccess }) {
  if (access.experimental) return null;
  const text = ACCESS_NOTICE_TEXT[access.kind === "demo" ? "demo" : "preview"];
  return (
    <aside
      aria-label={ACCESS_NOTICE_TEXT.label}
      data-access-notice=""
      className="sticky top-0 z-(--z-hud) h-(--notice-h) shrink-0 border-b border-rule bg-sunk text-ui text-ink"
    >
      <div className="flex h-full items-center justify-between gap-3 px-4 xs:px-6 lg:px-8">
        <NoticeWords text={text.plain} variant="plain" />
        <NoticeWords text={text.review} variant="review" />
        {access.kind === "demo" ? (
          <form action={endPublicDemo} className="shrink-0">
            {/* 44 px target in a 40 px strip: the ghost button has no visible box, so it may
                overhang the strip by 2 px each side; -mr-3 sets its label on the gutter edge. */}
            <Button type="submit" variant="ghost" className="-my-0.5 -mr-3 px-3">
              {ACCESS_NOTICE_TEXT.endDemo}
            </Button>
          </form>
        ) : null}
      </div>
    </aside>
  );
}
