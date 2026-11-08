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
  it("counts from the data it is given", () => {
    expect(homeDeck(SIX.filter((t) => t.slug !== "bagh"))).toContain("the other two stay");
    expect(homeDeck(SIX.filter((t) => (STUDY_TRADITION_SLUGS as readonly string[]).includes(t.slug)))).toContain("The study teaches all three.");
    expect(homeDeck([SIX[0]!, SIX[1]!], [])).toContain("None of it is taught");
  });
});

describe("privacy cookie list (DR-114)", () => {
  it("lists every cookie the app sets, with lifetimes from the code", () => {
    const listed = [...VISITOR_COOKIES, ...STAFF_COOKIES].map((c) => c.name);
    expect(listed).toEqual(["Invite", "Study enrolment", "Study session", "Participation history", "Demo", "Staff sign-in", "Known device", "Google sign-in"]);
    expect(VISITOR_COOKIES.map((c) => duration(c.seconds))).toEqual(["30 days", "2 hours", "6 hours", "180 days", "4 hours"]);
    expect(STAFF_COOKIES.map((c) => duration(c.seconds))).toEqual(["12 hours", "90 days", "5 minutes"]);
  });
});
