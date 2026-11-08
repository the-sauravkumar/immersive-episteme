import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { ACCESS_NOTICE_TEXT } from "@/features/learning/strings";
import type { LearningCondition } from "@/lib/permissions/learning";
import { cn } from "@/lib/utils";
import { endPublicDemo } from "@/server/auth/actions";
import type { LearningAccess } from "@/server/auth/learning-access";

export function LearningShell({ condition, children }: { condition: LearningCondition; children: ReactNode }) {
  return (
    <div
      data-condition={condition}
      data-zone="study"
      className={cn(
        "bg-vat",
        condition === "immersive"
          ? "immersive-root fixed inset-0 overflow-hidden overscroll-none"
          : "flex min-h-dvh flex-col",
      )}
    >
      <main id="main" tabIndex={-1} className={cn("outline-none", condition === "immersive" ? "flex h-full w-full flex-col" : "flex-1")}>
        <h1 className="sr-only">{condition === "immersive" ? "The Walkthrough" : "The Visual Course"}</h1>
        {children}
      </main>
    </div>
  );
}

function NoticeWords({ text }: { text: { long: string; medium: string; short: string } }) {
  return (
    <p className="min-w-0 truncate">
      <span className="xs:hidden">{text.short}</span>
      <span className="hidden xs:inline lg:hidden">{text.medium}</span>
      <span className="hidden lg:inline">{text.long}</span>
    </p>
  );
}

export function AccessNotice({ access }: { access: LearningAccess }) {
  if (access.experimental) return null;
  const text = ACCESS_NOTICE_TEXT[access.kind === "demo" ? "demo" : "preview"];
  return (
    <aside
      aria-label={ACCESS_NOTICE_TEXT.label}
      data-access-notice=""
      className="sticky top-0 z-(--z-hud) h-(--notice-h) shrink-0 border-b border-line bg-vat-2 t-label text-lime"
    >
      <div className="flex h-full items-center justify-between gap-3 px-4 xs:px-6 lg:px-8">
        <NoticeWords text={text} />
        {access.kind === "demo" ? (
          <form action={endPublicDemo} className="shrink-0">
            <Button type="submit" variant="ghost" className="-my-0.5 -mr-3 px-3">
              {ACCESS_NOTICE_TEXT.endDemo}
            </Button>
          </form>
        ) : null}
      </div>
    </aside>
  );
}
