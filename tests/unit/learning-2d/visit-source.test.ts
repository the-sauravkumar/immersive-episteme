/**
 * DR-021 navigation source in 2D: the link the learner used (rail, index, pager, link, close) is
 * carried to the next page's entry, once; a first entry and a reload carry none.
 */
import { describe, expect, it } from "vitest";

import { createVisitStore } from "@/features/learning-2d/visit-store";

describe("visit store navigation source", () => {
  it("carries the pending source to the next entry only", () => {
    const v = createVisitStore("s", null);
    expect(v.enter("catalogue", null).source).toBeNull();
    v.setPendingVia("navigation", "index");
    expect(v.enter("tradition:alpha", "t1")).toMatchObject({ via: "navigation", source: "index" });
    expect(v.enter("tradition:alpha", "t1")).toMatchObject({ via: "resume", source: null });
    v.setPendingVia("link", "rail");
    expect(v.enter("concept:a", "t1")).toMatchObject({ via: "link", source: "rail" });
    v.setPendingVia("navigation");
    expect(v.enter("concept:b", "t1").source).toBeNull();
  });
});
