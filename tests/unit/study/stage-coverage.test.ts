import { describe, expect, it } from "vitest";

import { admitStop, coverageOf, inAssignedOrder, PRODUCT_STOP_KEY, requiredStops } from "@/features/study/stage-coverage";
import { drawTraditionOrder } from "@/server/study/allocation";

import { fixtureTemplate } from "../research/fixtures";

const templates = [fixtureTemplate("ajrakh"), fixtureTemplate("sanganeri")];
const stops = requiredStops(templates);

describe("stage coverage", () => {
  it("requires every stage and the product stop, in assigned order", () => {
    expect(stops.map((s) => s.stageKey)).toEqual(["ajrakh-s1", "ajrakh-s2", PRODUCT_STOP_KEY, "sanganeri-s1", "sanganeri-s2", PRODUCT_STOP_KEY]);
    expect(stops[2]!.stageNumber).toBe(3);
    expect(inAssignedOrder(templates, ["sanganeri", "ajrakh"]).map((t) => t.tradition)).toEqual(["sanganeri", "ajrakh"]);
    expect(() => inAssignedOrder(templates, ["dabu"])).toThrow(/No stage template/);
  });

  it("counts visited stops and lists the unvisited, counting a revisit once", () => {
    const visits = [stops[0]!, stops[1]!, stops[0]!];
    const coverage = coverageOf(stops, visits);
    expect([coverage.required, coverage.visited, coverage.complete]).toEqual([6, 2, false]);
    expect(coverage.unvisited).toEqual(stops.slice(2));
    expect(coverageOf(stops, stops).complete).toBe(true);
  });

  it("admits the next stop and any earlier one, and refuses a stop ahead or unknown", () => {
    const visits = stops.slice(0, 2);
    expect(admitStop(stops, visits, stops[2]!)).toMatchObject({ admitted: true });
    expect(admitStop(stops, visits, stops[0]!)).toMatchObject({ admitted: true });
    expect(admitStop(stops, visits, stops[3]!)).toMatchObject({ admitted: false, reason: "stop_ahead", expected: stops[2] });
    expect(admitStop(stops, visits, { traditionKey: "ajrakh", stageKey: "nope" })).toMatchObject({ admitted: false, reason: "unknown_stop" });
    expect(admitStop(stops, [], stops[0]!)).toMatchObject({ admitted: true });
    expect(admitStop(stops, [], stops[1]!)).toMatchObject({ admitted: false, reason: "stop_ahead" });
  });
});

describe("counterbalanced tradition order", () => {
  const traditions = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"];
  const orders = (conditionCode: string, stratum: string | null, from = 0) => Array.from({ length: 6 }, (_, i) => drawTraditionOrder({ seed: "s", traditions, conditionCode, stratum, index: from + i }).join(">"));

  it("uses all six orders in every block of six, per condition and stratum", () => {
    for (const from of [0, 6, 12]) expect(new Set(orders("immersive", "low", from)).size).toBe(6);
    expect(new Set(orders("conventional", null)).size).toBe(6);
  });

  it("is reproducible from its inputs, whatever the input order of the traditions", () => {
    const one = drawTraditionOrder({ seed: "s", traditions, conditionCode: "a", index: 3 });
    expect(drawTraditionOrder({ seed: "s", traditions: [...traditions].reverse(), conditionCode: "a", index: 3 })).toEqual(one);
    expect(orders("immersive", "low")).not.toEqual(orders("immersive", "high"));
  });

  it("returns a single tradition as it is", () => {
    expect(drawTraditionOrder({ seed: "s", traditions: ["ajrakh"], conditionCode: "a", index: 0 })).toEqual(["ajrakh"]);
    expect(() => drawTraditionOrder({ seed: "s", traditions, conditionCode: "a", index: -1 })).toThrow();
  });
});
