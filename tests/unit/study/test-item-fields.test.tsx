import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LearningSessionFrame, capTimings } from "@/components/study/learning-session-frame";
import { MatchingField, moveCard, moveCardTo, SequenceField, SketchField } from "@/components/study/test-item-fields";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const options = [{ id: "a", label: "Card A" }, { id: "b", label: "Card B" }, { id: "c", label: "Card C" }];
const posted = (root: HTMLElement) => [...root.querySelectorAll<HTMLInputElement>('input[name="item:x"]')].map((i) => i.value);

describe("sequence cards", () => {
  it("moves with the pure helpers", () => {
    expect(moveCard(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveCard(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(moveCardTo(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("posts nothing until the participant acts, then the order, usable by keyboard buttons", () => {
    const { container } = render(<SequenceField name="item:x" options={options} />);
    expect(posted(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Move Card C up" }));
    expect(posted(container)).toEqual(["a", "c", "b"]);
    expect(screen.getByRole("status").textContent).toBe("Card C is now number 2 of 3.");
    expect(screen.getByRole("button", { name: "Move Card A up" })).toHaveProperty("disabled", true);
  });

  it("records an order kept as shown, and moves by drag", () => {
    const { container } = render(<SequenceField name="item:x" options={options} />);
    fireEvent.click(screen.getByRole("button", { name: "Keep This Order" }));
    expect(posted(container)).toEqual(["a", "b", "c"]);
    const cards = container.querySelectorAll("li");
    fireEvent.dragStart(cards[0]!);
    fireEvent.drop(cards[2]!);
    expect(posted(container)).toEqual(["b", "c", "a"]);
  });
});

describe("cloth state matching", () => {
  it("posts pair and stage from one select per image", () => {
    const pairs = [{ id: "p1", image: { path: "/walkthrough/cloth/a.jpg", alt: "The cloth after a stage" } }, { id: "p2", image: { path: "/walkthrough/cloth/b.jpg", alt: "The cloth after a stage" } }];
    render(<MatchingField name="item:x" pairs={pairs} options={options} />);
    const select = screen.getByRole("combobox", { name: "Stage for image 2" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "p2=b" } });
    expect(select.value).toBe("p2=b");
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });
});

describe("layout sketch", () => {
  it("draws strokes on the canvas with undo and clear, and posts nothing when empty", () => {
    const { container } = render(<SketchField name="item:x" maxBytes={1000} />);
    const hidden = () => container.querySelector<HTMLInputElement>('input[name="item:x"]')!.value;
    expect(hidden()).toBe("");
    const canvas = screen.getByRole("img");
    canvas.setPointerCapture = () => undefined;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
    const stroke = () => {
      fireEvent.pointerDown(canvas, { clientX: 10, clientY: 20, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 30, clientY: 40, pointerId: 1 });
      fireEvent.pointerUp(canvas, { pointerId: 1 });
    };
    stroke();
    stroke();
    expect(JSON.parse(hidden())).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(JSON.parse(hidden())).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(hidden()).toBe("");
  });
});

describe("learning cap", () => {
  it("works out the warning and the cap from the server clock", () => {
    expect(capTimings("2026-11-04T10:30:00.000Z", "2026-11-04T10:00:00.000Z", 5)).toEqual({ untilWarningMs: 25 * 60_000, untilCapMs: 30 * 60_000 });
  });

  it("renders the door with no warning before its time, and a cap past the timer maximum raises no Node warning", async () => {
    const warnings: string[] = [];
    const listen = (w: Error) => warnings.push(w.name);
    process.on("warning", listen);
    const { unmount } = render(
      <LearningSessionFrame endsAt="2099-01-01T00:00:00.000Z" serverNow="2026-11-04T10:00:00.000Z" warningMinutes={5}>
        <p>Door</p>
      </LearningSessionFrame>,
    );
    await new Promise((r) => setImmediate(r));
    expect(screen.getByText("Door")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("");
    unmount();
    process.off("warning", listen);
    expect(warnings).toEqual([]);
  });
});
