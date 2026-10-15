/**
 * The review decision form starts with no decision chosen (WP6 review): on an item under review
 * the first option is "Withdraw to draft", so a pre-selected option would let a slip of Enter
 * withdraw it. The confirm button stays focusable but aria-disabled, with the reason as its
 * description, until a decision is chosen.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const { transitionAction } = vi.hoisted(() => ({ transitionAction: vi.fn(async () => ({ ok: true as const, message: "Recorded." })) }));
vi.mock("@/server/cms/actions", () => ({ transitionAction }));

import { TransitionPanel } from "@/components/cms/transition-panel";

const OPTIONS = [
  { to: "draft", kind: "withdraw", label: "Withdraw to draft" },
  { to: "needs_evidence", kind: "needs_evidence", label: "Needs evidence" },
];

describe("TransitionPanel", () => {
  it("pre-selects nothing and blocks confirming until a decision is chosen", async () => {
    render(<TransitionPanel entityKind="concept" entityId="00000000-0000-4000-8000-000000000001" options={OPTIONS} />);
    for (const r of screen.getAllByRole("radio")) expect((r as HTMLInputElement).checked).toBe(false);
    const button = screen.getByRole("button", { name: "Confirm decision" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Choose a decision first.");
    expect(button).not.toBeDisabled(); // still focusable, so the reason can be read

    await userEvent.click(button);
    expect(transitionAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("radio", { name: /Needs evidence/ }));
    const ready = screen.getByRole("button", { name: "Confirm: Needs evidence" });
    expect(ready).not.toHaveAttribute("aria-disabled");
    expect(screen.queryByText("Choose a decision first.")).toBeNull();
  });
});
