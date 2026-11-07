import { publicDisplayFont } from "@/components/shell/public-font";
import { PublicShell } from "@/components/shell/public-shell";

/*
 * Anek Latin (Ek Type, Mumbai; OFL; variable wght and wdth), public display roles only: the home
 * h1, public h2 and the public wordmark (DESIGN.md 5.1, DR-022). It is never loaded on study,
 * 3D, console, CMS or admin routes, so those preload one font file and both study conditions use
 * one face. Self-hosted by next/font at build time; the CSP is unchanged.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${publicDisplayFont.variable} contents`}>
      <PublicShell>{children}</PublicShell>
    </div>
  );
}
