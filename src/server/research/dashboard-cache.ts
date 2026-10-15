/**
 * Request coalescing for the research dashboard: an in-process single-flight plus a small LRU
 * memo, both keyed by (study, fingerprint, notification version).
 *
 * Why this is not "caching stale data": the key changes with every committed change of the study.
 *  - fingerprint (dashboardFingerprint): index-backed maxima and hashes of everything the page
 *    shows, read fresh on every request;
 *  - version (DashboardNotifier.version): the shared LISTEN connection's epoch and the number of
 *    notifications received for the study; it moves at every commit that touched the study.
 * A memo entry is only ever served under the same key, i.e. when nothing changed since it was
 * computed. While the LISTEN connection is down (version null) nothing is memoised; concurrent
 * identical requests still share one computation.
 * A served memo entry carries the server time of THIS request's fingerprint check as
 * `generatedAt`: the data were confirmed current at that moment.
 */
import type { DashboardData } from "./dashboard";

export interface CoalescerDeps {
  fingerprint(studyId: string): Promise<{ serverTime: string; fingerprint: string }>;
  load(studyId: string, fp: { serverTime: string; fingerprint: string }): Promise<DashboardData | null>;
  version(studyId: string): string | null;
}

export interface Served {
  data: DashboardData | null;
  source: "memo" | "shared" | "computed";
}

export class DashboardCoalescer {
  private readonly inflight = new Map<string, Promise<DashboardData | null>>();
  private readonly memo = new Map<string, DashboardData | null>();
  /** Computations started (for tests and the bench). */
  computations = 0;

  constructor(
    private readonly deps: CoalescerDeps,
    private readonly maxEntries = 16,
  ) {}

  async get(studyId: string): Promise<Served> {
    const version = this.deps.version(studyId);
    const fp = await this.deps.fingerprint(studyId);
    const key = `${studyId}|${fp.fingerprint}|${version ?? "unlistened"}`;
    if (version !== null && this.memo.has(key)) {
      const data = this.memo.get(key)!;
      this.memo.delete(key);
      this.memo.set(key, data); // LRU: most recent last
      return { data: data && { ...data, generatedAt: fp.serverTime }, source: "memo" };
    }
    const running = this.inflight.get(key);
    if (running) return { data: await running, source: "shared" };
    this.computations++;
    const p = this.deps
      .load(studyId, fp)
      .then((data) => {
        if (version !== null && this.deps.version(studyId) === version) {
          this.memo.set(key, data);
          while (this.memo.size > this.maxEntries) this.memo.delete(this.memo.keys().next().value!);
        }
        return data;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return { data: await p, source: "computed" };
  }
}
