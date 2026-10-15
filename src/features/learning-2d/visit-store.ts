/**
 * Per-session navigation memory for the 2D condition: visit counts (revisit detection,
 * EVT-08), the last tradition seen (tradition crossings, EVT-09), the page the learner came from
 * and how they left it (`page_entered.metadata.via/fromId`).
 *
 * Kept in sessionStorage (keyed by the telemetry session id) so a reload does not reset it;
 * falls back to memory when storage is unavailable. Holds page ids and uuids only, never text.
 */

import type { NavigationSource } from "@/features/telemetry/contracts";

export type EntryVia = "navigation" | "link" | "search" | "guidance" | "start" | "resume";

export interface VisitState {
  visits: Record<string, number>;
  lastTraditionId: string | null;
  currentPageId: string | null;
  pendingVia: EntryVia | null;
  /** What the learner used to leave the last page (DR-021 navigation source), set with `pendingVia`. */
  pendingSource?: NavigationSource | null;
}

export interface VisitStore {
  /** Records the entry and returns what it means for telemetry. */
  enter(pageId: string, traditionId: string | null): { visitCount: number; via: EntryVia; fromId: string | null; crossedFrom: string | null; source: NavigationSource | null };
  /** The next page entry happens through `via`, from `source` (set by a link click just before navigating). */
  setPendingVia(via: EntryVia, source?: NavigationSource): void;
  read(): VisitState;
}

const empty = (): VisitState => ({ visits: {}, lastTraditionId: null, currentPageId: null, pendingVia: null, pendingSource: null });

export function createVisitStore(sessionId: string, storage: Pick<Storage, "getItem" | "setItem"> | null = safeSessionStorage()): VisitStore {
  const key = `ie-2d-visits:v1:${sessionId}`;
  let memory: VisitState | null = null;

  const load = (): VisitState => {
    if (memory) return memory;
    try {
      const raw = storage?.getItem(key);
      memory = raw ? { ...empty(), ...(JSON.parse(raw) as Partial<VisitState>) } : empty();
    } catch {
      memory = empty();
    }
    return memory;
  };
  const save = (s: VisitState) => {
    memory = s;
    try {
      storage?.setItem(key, JSON.stringify(s));
    } catch {
      // storage full or blocked: memory copy still works for this page load
    }
  };

  return {
    enter(pageId, traditionId) {
      const s = load();
      const first = s.currentPageId === null && Object.keys(s.visits).length === 0;
      const reload = !first && s.currentPageId === pageId && s.pendingVia === null;
      const via: EntryVia = first ? "start" : reload ? "resume" : (s.pendingVia ?? "navigation");
      // A reload of the page the learner is on is a resumption, not a revisit.
      const visitCount = (s.visits[pageId] ?? 0) + (reload ? 0 : 1);
      const crossedFrom = traditionId && s.lastTraditionId && s.lastTraditionId !== traditionId ? s.lastTraditionId : null;
      const source = first || reload ? null : (s.pendingSource ?? null);
      save({
        visits: { ...s.visits, [pageId]: visitCount },
        lastTraditionId: traditionId ?? s.lastTraditionId,
        currentPageId: pageId,
        pendingVia: null,
        pendingSource: null,
      });
      return { visitCount, via, fromId: first ? null : s.currentPageId, crossedFrom, source };
    },
    setPendingVia(via, source) {
      save({ ...load(), pendingVia: via, pendingSource: source ?? null });
    },
    read: () => load(),
  };
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
