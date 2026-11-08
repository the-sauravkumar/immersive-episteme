import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock("@/server/assessment/participant-actions", () => ({ saveReconstructionMap: save }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="canvas" /> }));
const tracker = vi.hoisted(() => ({ taskStarted: vi.fn(async () => null), taskCompleted: vi.fn(async () => null), guidanceCueUsed: vi.fn(async () => null) }));
vi.mock("@/features/telemetry/client", () => ({ useOptionalTelemetry: () => tracker }));

import { ReconstructionTask } from "@/components/assessment/reconstruction-task";
import type { MapConcept } from "@/components/assessment/map-state";

const concepts: MapConcept[] = ["Alpha", "Beta"].map((label, i) => ({ nodeKey: `c${i + 1}`, conceptId: `00000000-0000-4000-8000-00000000000${i + 1}`, label }));

const show = (practiceFirst: boolean) =>
  render(<ReconstructionTask itemId="00000000-0000-4000-8000-0000000000aa" concepts={concepts} relationshipTypes={[]} directedLinks initial={null} practiceFirst={practiceFirst} />);

const practice = () => screen.queryByRole("region", { name: "Try The Map First" });

beforeEach(() => vi.clearAllMocks());

describe("map practice before the first map (DR-136)", () => {
  it("comes before the first map with three everyday concepts, steps for mouse and keyboard, and nothing about the doors or the craft", () => {
    show(true);
    const section = practice()!;
    expect(section).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit map" })).toBeNull();
    const steps = within(section).getByRole("list", { name: "Practice steps" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent)).toEqual(["1. Place a concept", "2. Link two concepts", "3. Turn the link around", "4. Delete the link", "5. Finish"]);
    for (const li of within(steps).getAllByRole("listitem")) expect(li.textContent).toMatch(/Mouse: .+Keyboard: /);
    expect(within(steps).getAllByRole("listitem")[0]).toHaveAttribute("aria-current", "step");
    const from = within(section).getByLabelText("From concept");
    expect(within(from).getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose…", "Rain", "Umbrella", "Puddle"]);
    expect(section.textContent).not.toMatch(/door|walk|3D|2D|immersive|room|yard|cloth|dye|print/i);
    expect(tracker.taskStarted).toHaveBeenCalledWith({ metadata: { taskCode: "practice.concept-map" }, roomOrPageId: "study:reconstruction", target: "practice.concept-map" });
  });

  it("ticks each step as the participant links, reverses and deletes by keyboard, saves nothing, then opens the real task", async () => {
    show(true);
    const user = userEvent.setup();
    const section = practice()!;
    const form = within(section).getByRole("form", { name: "Add A Relationship" });
    await user.selectOptions(within(form).getByLabelText("From concept"), "Rain");
    await user.selectOptions(within(form).getByLabelText("To concept"), "Puddle");
    await user.click(within(form).getByRole("button", { name: "Add relationship" }));
    await user.click(within(section).getByRole("button", { name: "Reverse: Rain is linked to Puddle" }));
    await user.click(within(section).getByRole("button", { name: "Delete: Puddle is linked to Rain" }));
    const steps = within(section).getAllByRole("listitem").filter((li) => li.closest("ol"));
    expect(steps.slice(1, 4).every((li) => li.textContent!.includes("(done)"))).toBe(true);
    expect(steps[0]!.textContent).not.toContain("(done)");
    expect(save).not.toHaveBeenCalled();
    await user.click(within(section).getByRole("button", { name: "Start the real task" }));
    expect(practice()).toBeNull();
    expect(tracker.taskCompleted).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ taskCode: "practice.concept-map" }) }));
    expect(screen.getByRole("button", { name: "Submit map" })).toBeVisible();
    expect(screen.getByText(/^How it works:/)).toBeVisible();
  });

  it("can be skipped, is logged as skipped, and reopens from the task while the map stays in place", async () => {
    show(true);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Skip the practice" }));
    expect(tracker.guidanceCueUsed).toHaveBeenCalledWith({ metadata: { action: "dismissed", cueId: "practice.concept-map" }, roomOrPageId: "study:reconstruction", target: "practice.concept-map" });
    const real = screen.getByRole("form", { name: "Add A Relationship" });
    await user.selectOptions(within(real).getByLabelText("From concept"), "Alpha");
    await user.selectOptions(within(real).getByLabelText("To concept"), "Beta");
    await user.click(within(real).getByRole("button", { name: "Add relationship" }));
    await user.click(screen.getByRole("button", { name: "Show the practice again" }));
    expect(practice()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit map" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Start the real task" }));
    expect(screen.getByText("Alpha is linked to Beta")).toBeVisible();
  });

  it("opens straight on the task once the participant has a map, with the help one press away", () => {
    show(false);
    expect(practice()).toBeNull();
    expect(screen.getByRole("button", { name: "Submit map" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show the practice again" })).toBeInTheDocument();
  });
});
