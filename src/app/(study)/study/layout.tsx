import { StudyShell } from "@/components/shell/study-shell";



export default function StudyLayout({ children }: LayoutProps<"/study">) {
  return <StudyShell>{children}</StudyShell>;
}
