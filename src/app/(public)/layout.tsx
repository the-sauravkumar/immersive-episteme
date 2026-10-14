import { PublicShell } from "@/components/shell/public-shell";

/** Public pages: static editorial shell, no session reads. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
