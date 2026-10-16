/** PASS/FAIL table shared by preflight.ts and smoke.ts. Details never contain secret values. */
export type Status = "PASS" | "FAIL" | "WARN" | "SKIP" | "INFO";

export interface Check {
  area: string;
  name: string;
  status: Status;
  detail: string;
}

export class Report {
  readonly checks: Check[] = [];

  add(area: string, name: string, status: Status, detail = ""): Check {
    const c = { area, name, status, detail };
    this.checks.push(c);
    return c;
  }

  get failed(): number {
    return this.checks.filter((c) => c.status === "FAIL").length;
  }

  print(title: string): void {
    const w = (k: "area" | "name") => Math.min(34, Math.max(k.length, ...this.checks.map((c) => c[k].length)));
    const aw = w("area");
    const nw = w("name");
    const line = `+-${"-".repeat(aw)}-+-${"-".repeat(nw)}-+------+`;
    const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}~` : s.padEnd(n));
    console.log(`\n${title}`);
    console.log(line);
    console.log(`| ${"Area".padEnd(aw)} | ${"Check".padEnd(nw)} | Stat |`);
    console.log(line);
    for (const c of this.checks) {
      console.log(`| ${cut(c.area, aw)} | ${cut(c.name, nw)} | ${c.status.padEnd(4)} |${c.detail ? `  ${c.detail}` : ""}`);
    }
    console.log(line);
    const count = (s: Status) => this.checks.filter((c) => c.status === s).length;
    console.log(
      `${count("PASS")} pass, ${count("FAIL")} fail, ${count("WARN")} warn, ${count("SKIP")} skip, ${count("INFO")} info -> ${this.failed === 0 ? "OVERALL PASS" : "OVERALL FAIL"}`,
    );
  }
}
