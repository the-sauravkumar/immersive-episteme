/**
 * Shown in both conditions whenever the snapshot holds content no curator has verified
 * (`ctx.unverifiedContent`, data-and-telemetry-layer §2). Same wording in 2D and 3D.
 *
 * Styled as the AccessNotice strip (DESIGN.md 9.15): 40 px, `--sunk`, `text-ui`, sticky, one line at
 * every width (a shorter wording under 768 px), in the same slot above the StudyBar in both
 * conditions. It is ONE strip with the AccessNotice: while an AccessNotice is present (demo, staff
 * preview) this strip is hidden and the AccessNotice shows its merged "under review" wording
 * (globals.css, "AccessNotice merge"). Participants see it only when the study runs on unverified
 * content, and then alone.
 */
import { NOTICE_TEXT } from "@/features/learning/strings";
import { cn } from "@/lib/utils";

/** The wording, from the one string table (strings.ts NOTICE_TEXT). */
export const UNVERIFIED_NOTICE_WORDS = { long: NOTICE_TEXT.unverifiedLong, short: NOTICE_TEXT.unverifiedShort } as const;

export function UnverifiedContentNotice({ className }: { className?: string }) {
  return (
    <p
      role="note"
      data-slot="unverified-notice"
      className={cn("text-ui sticky top-0 z-(--z-hud) flex h-[var(--notice-h)] items-center overflow-hidden border-b border-rule bg-sunk px-4 whitespace-nowrap text-ink xs:px-6 lg:px-8", className)}
    >
      <span className="hidden md:inline">{UNVERIFIED_NOTICE_WORDS.long}</span>
      <span className="md:hidden">{UNVERIFIED_NOTICE_WORDS.short}</span>
    </p>
  );
}
