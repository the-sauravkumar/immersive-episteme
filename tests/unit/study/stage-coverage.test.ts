import { describe, expect, it } from "vitest";

import { admitStop, coverageOf, inAssignedOrder, PRODUCT_STOP_KEY, requiredStops } from "@/features/study/stage-coverage";
import { allocationBlockKey, drawCondition, drawTradition } from "@/server/study/allocation";

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

describe("one tradition per participant, balanced across the doors", () => {
  const traditions = ["ajrakh", "sanganeri", "machilipatnam-kalamkari"];
  const conditions = [
    { id: "c2d", code: "conventional", weight: 1 },
    { id: "c3d", code: "immersive", weight: 1 },
  ];

  it("draws every tradition once in every block of three", () => {
    for (const block of [0, 1, 2, 7]) {
      const drawn = [0, 1, 2].map((p) => drawTradition({ seed: "s", traditions, index: block * 3 + p }).tradition);
      expect(new Set(drawn)).toEqual(new Set(traditions));
    }
  });

  it("is reproducible from its inputs, whatever the input order of the traditions", () => {
    const one = drawTradition({ seed: "s", traditions, index: 4 });
    expect(drawTradition({ seed: "s", traditions: [...traditions].reverse(), index: 4 })).toEqual(one);
    expect(one).toMatchObject({ blockIndex: 1, positionInBlock: 1 });
    expect(() => drawTradition({ seed: "s", traditions, index: -1 })).toThrow();
    expect(() => drawTradition({ seed: "s", traditions: [], index: 0 })).toThrow();
  });

  it("blocks the condition draw within each tradition and stratum, so each tradition is split evenly between the doors", () => {
    expect(allocationBlockKey("ajrakh", "low")).toBe("ajrakh:low");
    expect(allocationBlockKey("ajrakh", null)).toBe("ajrakh");
    for (const tradition of traditions) {
      for (const stratum of ["low", "high"]) {
        const doors = Array.from({ length: 8 }, (_, index) => drawCondition({ algorithm: "stratified_block", seed: "s", conditions, index, stratum: allocationBlockKey(tradition, stratum), blockSize: 4 }).conditionCode);
        expect(doors.filter((d) => d === "immersive")).toHaveLength(4);
        expect(doors.slice(0, 4).filter((d) => d === "immersive")).toHaveLength(2);
      }
    }
    const ajrakh = Array.from({ length: 4 }, (_, index) => drawCondition({ algorithm: "block", seed: "s", conditions, index, stratum: "ajrakh" }).conditionCode).join();
    const sanganeri = Array.from({ length: 4 }, (_, index) => drawCondition({ algorithm: "block", seed: "s", conditions, index, stratum: "sanganeri" }).conditionCode).join();
    expect([ajrakh, sanganeri].every((order) => order.split(",").filter((d) => d === "immersive").length === 2)).toBe(true);
  });
});
