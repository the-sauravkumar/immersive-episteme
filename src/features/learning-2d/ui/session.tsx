"use client";

/**
 * Client session for the 2D condition, mounted once in the /learn/2d layout so it survives page
 * navigations: the telemetry tracker (one per learning session), the visit memory used for
 * revisit and tradition-crossing detection, the shared learning-phase controls and guidance
 * (the same components the 3D museum mounts), the StudyBar sheet state (exposure.tsx) and the
 * page-supplied StudyBar location (`StudyBarLocation`).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { GuidanceProvider } from "@/components/learning/guidance";
import { LearningPhaseProvider, type LearningPhaseMode } from "@/components/learning/learning-phase";
import type { GuidanceSettings } from "@/features/learning/settings";
import type { LearningTimeBudget } from "@/features/learning/time-budget";
import { TelemetryProvider, type TelemetryConfig } from "@/features/telemetry/client/provider";
import { cn } from "@/lib/utils";

import type { ParentLink } from "../navigation";
import { LEARN_2D } from "../routes";
import { createVisitStore, type VisitStore } from "../visit-store";

import { ChromeOverlayProvider } from "./exposure";

const VisitContext = createContext<VisitStore | null>(null);

export interface Learning2dSessionProps {
  telemetry: Pick<TelemetryConfig, "sessionId" | "contentVersion" | "appBuild" | "mode">;
  budget: LearningTimeBudget;
  mode: LearningPhaseMode;
  guidance: GuidanceSettings;
  children: ReactNode;
}

export function Learning2dSession({ telemetry, budget, mode, guidance, children }: Learning2dSessionProps) {
  const visits = useMemo(() => createVisitStore(telemetry.sessionId), [telemetry.sessionId]);
  return (
    <TelemetryProvider config={telemetry}>
      <VisitContext.Provider value={visits}>
        <LearningPhaseProvider budget={budget} mode={mode}>
          <GuidanceProvider guidance={guidance}>
            <ChromeOverlayProvider>
              <PageLocationProvider>{children}</PageLocationProvider>
            </ChromeOverlayProvider>
          </GuidanceProvider>
        </LearningPhaseProvider>
      </VisitContext.Provider>
    </TelemetryProvider>
  );
}

/** Visit memory; tests may mount their own provider. */
export const VisitStoreProvider = VisitContext.Provider;

export function useVisitStore(): VisitStore {
  const v = useContext(VisitContext);
  if (!v) throw new Error("useVisitStore() must be used inside <Learning2dSession>.");
  return v;
}

// ---------------------------------------------------------------------------------------
// Page-supplied StudyBar location
// ---------------------------------------------------------------------------------------

/** What a page says about itself for the StudyBar, tied to the path it was set on. */
export interface PageLocation {
  pathname: string;
  location: string;
  parent: ParentLink | null;
}

const PageLocationContext = createContext<{ value: PageLocation | null; set(value: PageLocation | null): void }>({ value: null, set: () => {} });

function PageLocationProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState<PageLocation | null>(null);
  const ctx = useMemo(() => ({ value, set }), [value]);
  return <PageLocationContext.Provider value={ctx}>{children}</PageLocationContext.Provider>;
}

/** The page's own location, when it set one for the current path. */
export function usePageLocation(pathname: string): PageLocation | null {
  const { value } = useContext(PageLocationContext);
  return value && value.pathname === pathname ? value : null;
}

/**
 * Rendered by a concept page: names the page and its parent in the StudyBar. The bar already
 * names every in-scope tradition concept and comparison from the URL on the first paint; this
 * covers the rest (a shared concept reached through a link) and always agrees with the page.
 */
export function StudyBarLocation({ location, parent }: { location: string; parent: ParentLink | null }) {
  const pathname = usePathname() ?? "";
  const { set } = useContext(PageLocationContext);
  const parentHref = parent?.href ?? null;
  const parentLabel = parent?.label ?? null;
  useEffect(() => {
    set({ pathname, location, parent: parentHref && parentLabel ? { href: parentHref, label: parentLabel } : null });
    return () => set(null);
  }, [set, pathname, location, parentHref, parentLabel]);
  return null;
}

// ---------------------------------------------------------------------------------------
// Learning-task prompts slot (DESIGN.md 11.5: nothing stacks above the content)
// ---------------------------------------------------------------------------------------

/**
 * Where the protocol's learning-task prompts sit in 2D below 1024 px (from 1024 px they sit at the
 * top of the index field, spread.tsx, as the museum keeps them at the top left of its scene). Never
 * above a concept's KnowledgeSheet, so the sheet stays directly under the chrome (P6) with the same
 * claim lines in the first screen (P8) whether or not a protocol sets prompts:
 *  - on a concept page: in flow AFTER the sheet (the museum's full-screen panel covers its prompts
 *    at these widths);
 *  - on the other pages (no 3D counterpart is measured): at the top of the column.
 * The frame renders the slot twice, `before` and `after` the page; only the one that applies to
 * the current path renders.
 */
export function LearningPromptsSlot({ position, children }: { position: "before" | "after"; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const onConcept = pathname.startsWith(`${LEARN_2D}/concepts/`);
  if ((position === "after") !== onConcept) return null;
  return (
    <div data-slot="learning-prompts-slot" className={cn("mx-auto w-full max-w-[39.25rem] px-4 xs:px-6 lg:hidden", position === "before" ? "pt-6" : "pb-12")}>
      {children}
    </div>
  );
}
