import { StudyShell } from "@/components/shell/study-shell";

/*
 * The focus ring of the study pages is the global one (globals.css, DESIGN.md 9.1, R-A5): the
 * primitives no longer carry `outline-none`, so the former study-only stopgap rule is gone.
 */

/** /study/*: minimal participant-facing shell. Entry pages are public; steps are gated in (session). */
export default function StudyLayout({ children }: LayoutProps<"/study">) {
  return <StudyShell>{children}</StudyShell>;
}
