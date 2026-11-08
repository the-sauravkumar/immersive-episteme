import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CoursePractice } from "@/features/course/ui/course-practice";
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
  products: [{ id: "p1", file: "/walkthrough/products/p1.jpg", name: "Ajrakh Textile", holder: "A Holder", widthPx: 100, heightPx: 100, record: "https://example.org/record" }],
};

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

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
    render(<CourseSession templates={[template]} studyMode onStageEntered={entered} onStageLeft={left} onBackStep={back} onSourceOpened={source} onFinished={finished} />);

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
    const { rerender } = render(<CourseSession templates={[template]} studyMode onStageEntered={entered} onFinished={finished} />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    rerender(<CourseSession templates={[template]} studyMode onStageEntered={entered} onFinished={finished} restore={{ tradition: 0, stop: 0 }} />);
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

  it("labels the last button Finish outside a study, where no questions follow", () => {
    render(<CourseSession templates={[template]} resume={{ tradition: 0, stop: 2, reached: [2] }} />);
    expect(screen.getByRole("button", { name: "Finish" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Questions" })).toBeNull();
  });

  it("states the configured time limit in Help, and that going back stays in the tradition", () => {
    render(<CourseSession templates={[template]} studyMode guidance={{ time: { limitMinutes: 45 }, hint: null, stallSeconds: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const help = screen.getByRole("dialog").textContent ?? "";
    expect(help).toContain("the session limit of 45 minutes");
    expect(help).not.toContain("30 minutes");
    expect(help).toContain("in the tradition you are in");
  });

  it("offers the study's hint and the stall cue after the set active time without a new stage, and logs each use", () => {
    vi.useFakeTimers();
    try {
      const report = vi.fn();
      render(<CourseSession templates={[template]} studyMode guidance={{ time: { limitMinutes: 30 }, hint: "Follow the cloth.", stallSeconds: 60 }} onGuidance={report} />);
      fireEvent.click(screen.getByRole("button", { name: "Hint" }));
      expect(screen.getByRole("dialog").textContent).toContain("Follow the cloth.");
      expect(report).toHaveBeenLastCalledWith("followed", "hint");
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      act(() => vi.advanceTimersByTime(59_000));
      expect(screen.queryByText("A hint is ready if you want one.")).toBeNull();
      act(() => vi.advanceTimersByTime(1_000));
      expect(screen.getByText("A hint is ready if you want one.")).toBeTruthy();
      expect(report).toHaveBeenLastCalledWith("shown", "stall");
      fireEvent.click(screen.getByRole("button", { name: "Open Hint" }));
      expect(report).toHaveBeenLastCalledWith("followed", "stall");
      expect(screen.getByRole("dialog").textContent).toContain("Follow the cloth.");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("CoursePractice", () => {
  it("tells the practice's own facts in Help, not the session's stages, sources and limit", () => {
    render(<CoursePractice />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const help = screen.getByRole("dialog").textContent ?? "";
    expect(help).toContain("Nothing here is part of the test");
    expect(help).not.toMatch(/stage|sources|30 minutes/i);
  });
});
