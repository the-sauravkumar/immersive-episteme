/**
 * The study a research page opens on when none is requested: a real study first, then the newest
 * demo study that is not an automated-test or audit fixture (review fix round).
 */
import { describe, expect, it } from "vitest";

import { isTestFixtureStudy, pickStudy } from "@/app/(research)/research/_components/common";
import type { StudySummary } from "@/server/research/studies";

const study = (slug: string, isDemo: boolean): StudySummary => ({
  id: slug,
  slug,
  title: slug,
  status: "active",
  protocolVersion: "1",
  design: "between",
  isDemo,
  participants: 0,
  sessions: 0,
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("pickStudy", () => {
  // listStudies order: real studies first, then demo studies, newest first.
  const fixtures = [study("demo-e2e-map-cf7632", true), study("demo-rev-map-c47ab7", true), study("demo-audit-map-f68347", true), study("demo-w4-onb-mv8qwjls", true)];

  it("recognises the fixture families and leaves real demo studies alone", () => {
    for (const f of fixtures) expect(isTestFixtureStudy(f), f.slug).toBe(true);
    expect(isTestFixtureStudy(study("demo-e2e-study-engine-d8-practice", true))).toBe(true);
    expect(isTestFixtureStudy(study("demo-review-walkthrough", true))).toBe(false);
    expect(isTestFixtureStudy(study("demo-study", true))).toBe(false);
  });

  it("opens a real study first, then the newest demo study that is not a fixture", () => {
    expect(pickStudy([study("main-2026", false), ...fixtures], undefined)?.slug).toBe("main-2026");
    expect(pickStudy([...fixtures, study("demo-review-walkthrough", true), study("demo-study", true)], undefined)?.slug).toBe("demo-review-walkthrough");
    // Only fixtures: the newest one, so the page is never empty.
    expect(pickStudy(fixtures, undefined)?.slug).toBe("demo-e2e-map-cf7632");
  });

  it("honours a requested study, fixture or not", () => {
    expect(pickStudy([study("demo-study", true), ...fixtures], "demo-rev-map-c47ab7")?.slug).toBe("demo-rev-map-c47ab7");
  });
});
