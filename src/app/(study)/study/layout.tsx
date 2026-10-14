import { StudyShell } from "@/components/shell/study-shell";

/** /study/*: minimal participant-facing shell. Entry pages are public; steps are gated in (session). */
export default function StudyLayout({ children }: LayoutProps<"/study">) {
  return <StudyShell>{children}</StudyShell>;
}
