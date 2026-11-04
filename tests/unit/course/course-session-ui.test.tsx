import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CourseSession } from "@/features/course/ui/course-session";
import type { StageTemplate } from "@/features/process/domain/stage-template";

const stage = (number: number) => ({
  number,
  key: `ajrakh.s${number}`,
  sourceStageKeys: [],
  name: `Stage Name ${number}`,
  localName: null,
  kind: "table" as const,
  caption: { text: `Caption ${number}.`, sources: [{ sourceId: "S1", title: "A Source", locator: "p. 1", quote: "A quote." }] },
  items: [],
  clothStateId: `ajrakh-0${number}`,
});

const template: StageTemplate = {
  tradition: "ajrakh",
  traditionName: "Ajrakh",
  rawClothStateId: "ajrakh-raw",
  stages: [stage(1), stage(2)],
  products: [{ id: "p1", file: "/walkthrough/products/p1.jpg", name: "Ajrakh Textile", holder: "A Holder", widthPx: 100, heightPx: 100 }],
};

async function settle(): Promise<void> {
  await vi.waitFor(() => {
    const forward = document.querySelector<HTMLButtonElement>(".step-next");
    expect(forward?.disabled).toBe(false);
  }, 15000);
}

describe("CourseSession", () => {
  it("offers no way to jump ahead, reports its events and ends with Questions", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    const entered = vi.fn();
    const left = vi.fn();
    const back = vi.fn();
    const source = vi.fn();
    const finished = vi.fn();
    render(<CourseSession templates={[template]} onStageEntered={entered} onStageLeft={left} onBackStep={back} onSourceOpened={source} onFinished={finished} />);

    expect(entered).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Stage Name 1" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Stage \d/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Back/ })).toHaveProperty("disabled", true);

    await settle();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(left).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "Stage Name 2" })).toBeTruthy();

    await settle();
    fireEvent.click(screen.getByRole("button", { name: /^Back/ }));
    expect(back).toHaveBeenCalledTimes(1);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    expect(screen.getByRole("heading", { name: "Finished Textiles" })).toBeTruthy();

    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Questions" }));
    expect(finished).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("returns the learner to the stop the door asks for, and retries a refused finish", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    const entered = vi.fn();
    const finished = vi.fn(async () => false);
    const { rerender } = render(<CourseSession templates={[template]} onStageEntered={entered} onFinished={finished} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    rerender(<CourseSession templates={[template]} onStageEntered={entered} onFinished={finished} restore={{ tradition: 0, stop: 0 }} />);
    await vi.waitFor(() => expect(screen.getByRole("heading", { name: "Stage Name 1" })).toBeTruthy());
    expect(entered.mock.calls.map(([event]) => event.stageNumber)).toEqual([1, 2, 1]);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Questions" }));
    expect(finished).toHaveBeenCalledTimes(1);
    await settle();
    expect(screen.getByRole("button", { name: /^Back/ })).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "Questions" }));
    expect(finished).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("resumes at the stored stop without an entry report and sends the exit once on unmount", async () => {
    vi.stubGlobal(
      "Image",
      class {
        onerror: (() => void) | null = null;
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onerror?.());
        }
      },
    );
    const entered = vi.fn();
    const left = vi.fn();
    const { unmount } = render(<CourseSession templates={[template]} onStageEntered={entered} onStageLeft={left} resume={{ tradition: 0, stop: 1, reached: [1] }} />);
    expect(screen.getByRole("heading", { name: "Stage Name 2" })).toBeTruthy();
    expect(entered).not.toHaveBeenCalled();
    unmount();
    expect(left).toHaveBeenCalledTimes(1);
    expect(left.mock.calls[0]![0]).toMatchObject({ stageNumber: 2 });
    vi.unstubAllGlobals();
  });
});
