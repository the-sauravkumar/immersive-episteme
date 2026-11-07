import { UNVERIFIED_NOTICE_TEXT } from "@/features/learning/strings";

export function UnverifiedContentNotice() {
  return (
    <aside
      aria-label={UNVERIFIED_NOTICE_TEXT.label}
      data-slot="unverified-notice"
      className="sticky top-0 z-(--z-hud) flex h-(--notice-h) shrink-0 items-center overflow-hidden border-b border-rule bg-sunk px-4 text-ui whitespace-nowrap text-ink xs:px-6 lg:px-8"
    >
      <p className="min-w-0 truncate">
        <span className="md:hidden">{UNVERIFIED_NOTICE_TEXT.short}</span>
        <span className="hidden md:inline">{UNVERIFIED_NOTICE_TEXT.long}</span>
      </p>
    </aside>
  );
}
