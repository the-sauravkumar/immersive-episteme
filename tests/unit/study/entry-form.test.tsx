import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ enterStudy: vi.fn() }));
vi.mock("@/server/study/actions", () => actions);

import { EntryForm } from "@/components/study/entry-form";

beforeEach(() => vi.clearAllMocks());

describe("study entry by a typed code", () => {
  it("offers the study's groups when the server asks for one, and keeps the typed code", async () => {
    actions.enterStudy.mockResolvedValueOnce({ strata: ["Morning", "Evening"], fieldErrors: { stratum: "Choose the group the facilitator told you." } });
    render(<EntryForm strata={[]} />);
    expect(screen.queryByRole("group", { name: "Group" })).toBeNull();
    const code = screen.getByLabelText("Study code");
    fireEvent.change(code, { target: { value: "craft-study" } });
    await act(async () => {
      fireEvent.submit(code.closest("form")!);
    });
    const group = await screen.findByRole("group", { name: "Group" });
    expect(screen.getByRole("radio", { name: "Morning" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Evening" })).toBeInTheDocument();
    expect(group).toHaveAccessibleDescription("Choose the group the facilitator told you.");
    expect(code).toHaveValue("craft-study");
  });
});
