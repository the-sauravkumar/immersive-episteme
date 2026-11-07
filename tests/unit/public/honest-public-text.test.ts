import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { STUDY_TRADITION_SLUGS } from "@/features/learning/labels";
import { duration, STAFF_COOKIES, VISITOR_COOKIES } from "@/server/public/cookie-inventory";
import { homeDeck } from "@/server/public/dataset-stats";

const SIX = [
  { slug: "ajrakh", shortName: "Ajrakh" },
  { slug: "bagh", shortName: "Bagh" },
  { slug: "bagru", shortName: "Bagru" },
  { slug: "dabu", shortName: "Dabu" },
  { slug: "machilipatnam-kalamkari", shortName: "Machilipatnam Kalamkari" },
  { slug: "sanganeri", shortName: "Sanganeri" },
];

describe("home deck (DR-114)", () => {
  it("says which traditions the two conditions teach and that the rest are not taught", () => {
    const deck = homeDeck(SIX);
    expect(deck).toBe(
      "Six traditions of Indian hand-block printing, Ajrakh, Bagh, Bagru, Dabu, Machilipatnam Kalamkari and Sanganeri, form one cited body of knowledge. " +
        "The two learning conditions teach three of them, Ajrakh, Machilipatnam Kalamkari and Sanganeri; the other three stay in the knowledge base and are not taught in the study.",
    );
    expect(deck).not.toContain("learned two ways");
    expect(STUDY_TRADITION_SLUGS).toHaveLength(3);
  });

  it("counts from the data it is given", () => {
    expect(homeDeck(SIX.filter((t) => t.slug !== "bagh"))).toContain("the other two stay");
    expect(homeDeck(SIX.filter((t) => (STUDY_TRADITION_SLUGS as readonly string[]).includes(t.slug)))).toContain("teach all three.");
    expect(homeDeck([SIX[0]!, SIX[1]!], [])).toContain("None of it is taught");
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("privacy cookie list (DR-114)", () => {
  it("lists every cookie the app sets, with lifetimes from the code", () => {
    const listed = [...VISITOR_COOKIES, ...STAFF_COOKIES].map((c) => c.name);
    expect(listed).toEqual(["Invite", "Study enrolment", "Study session", "Participation history", "Demo", "Staff sign-in", "Known device", "Google sign-in"]);
    expect(VISITOR_COOKIES.map((c) => duration(c.seconds))).toEqual(["30 days", "2 hours", "6 hours", "180 days", "4 hours"]);
    expect(STAFF_COOKIES.map((c) => duration(c.seconds))).toEqual(["12 hours", "90 days", "5 minutes"]);
  });

  it("has an entry for every cookie constant the source sets", () => {
    const setters = new Set<string>();
    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\.set\(\s*([A-Z_]+_COOKIE)\b/g)) setters.add(m[1]!);
      for (const m of text.matchAll(/createAuthCookie\(\s*([A-Z_]+_COOKIE)\b/g)) setters.add(m[1]!);
    }
    const covered: Record<string, string> = {
      INVITE_COOKIE: "Invite",
      ENROLMENT_COOKIE: "Study enrolment",
      PARTICIPANT_COOKIE: "Study session",
      HISTORY_COOKIE: "Participation history",
      DEMO_COOKIE: "Demo",
      KNOWN_DEVICE_COOKIE: "Known device",
    };
    const names = [...VISITOR_COOKIES, ...STAFF_COOKIES].map((c) => c.name as string);
    for (const constant of setters) {
      expect(covered[constant], `${constant} is set in src but not described on the privacy page`).toBeDefined();
      expect(names).toContain(covered[constant]);
    }
    expect([...setters].sort()).toEqual(Object.keys(covered).sort());
  });
});
