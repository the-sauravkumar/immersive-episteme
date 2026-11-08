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
      this.memo.set(key, data);
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
