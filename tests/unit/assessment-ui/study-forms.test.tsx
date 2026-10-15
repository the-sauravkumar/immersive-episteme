/**
 * Study pages (DESIGN.md 11.7, WP4): the assessment form's question typography, option rows,
 * Likert scale and error summary; the action-row order; focus after a submit (the button stays
 * focusable while pending; a field refusal focuses the invalid control); the display choice that
 * offers the High contrast accommodation once, before the pre-test (consent page), shown read-only
 * and recorded with the device check (DR-019); and the session step count.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  markAssessmentStarted: vi.fn(async () => ({ ok: true })),
  submitAssessmentForm: vi.fn(async () => ({})),
  submitDeviceCheck: vi.fn(async () => ({ ok: true, outcome: "retry", reason: "viewport_too_small" })),
  decideConsent: vi.fn(async () => ({})),
  withdrawFromStudy: vi.fn(async () => ({})),
}));
vi.mock("@/server/study/actions", () => actions);
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { AssessmentForm, type RenderItem } from "@/components/study/assessment-form";
import { ConsentForm } from "@/components/study/consent-form";
import { DeviceCheck, StudyDisplayChoice } from "@/components/study/device-check";
import { WithdrawForm } from "@/components/study/withdraw-form";
import { stepCountOf } from "@/components/study/step-progress";

const assessment = { id: "00000000-0000-4000-8000-000000000001", code: "demo", version: 1, title: "Demo questions", description: null, presentation: "standard" as const };
const items: RenderItem[] = [
  { id: "q1", kind: "single_choice", prompt: "Which one?", options: [{ id: "a", label: "Option A" }, { id: "b", label: "Option B" }] },
  { id: "q2", kind: "likert", prompt: "How much?", points: 5, min: 1, anchors: { "1": "Not at all", "5": "Very much" } },
  { id: "q3", kind: "long_text", prompt: "Why?", maxLength: 500 },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.className = "";
});

describe("AssessmentForm (DESIGN.md 11.7)", () => {
  it("numbers every question 'Question n of N' and sets the question in Inter 20/28 600", () => {
    render(<AssessmentForm step="post_test" assessment={assessment} items={items} returnTo="/study/post-test" />);
    expect(screen.getByText("Question 1 of 3")).toHaveClass("tabular-nums");
    expect(screen.getByText("Question 3 of 3")).toBeInTheDocument();
    const q = screen.getByText("Which one?");
    expect(q.className).toMatch(/text-\[1\.25rem\]/);
    expect(q.className).toMatch(/leading-7/);
    expect(q.className).toMatch(/font-semibold/);
    // The legend names the group: the count and the question.
    expect(screen.getByRole("group", { name: "Question 1 of 3 Which one?" })).toBeInTheDocument();
  });

  it("renders choices as full-row 56 px labels with a native control, wash and a check when chosen, no bar (DR-022)", async () => {
    render(<AssessmentForm step="post_test" assessment={assessment} items={items} returnTo="/study/post-test" />);
    const radio = screen.getByLabelText("Option A");
    const row = radio.closest("label")!;
    expect(row.className).toMatch(/min-h-14/);
    expect(row.className).toMatch(/has-\[:checked\]:bg-wash/);
    expect(row.className).not.toMatch(/border-l/);
    expect(radio.className).toContain("ie-check");
    // A check icon is reserved in every row (no layout shift) and shown only for the chosen one.
    expect(row.querySelector("svg[aria-hidden=true]")).not.toBeNull();
    await userEvent.setup().click(screen.getByText("Option B"));
    expect(screen.getByLabelText("Option B")).toBeChecked();
  });

  it("renders a Likert scale as one radio per point, named by its number, with the end labels", () => {
    render(<AssessmentForm step="post_test" assessment={assessment} items={items} returnTo="/study/post-test" />);
    const group = screen.getByRole("group", { name: /How much\?/ });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(within(group).getByLabelText(/^3$/)).toBeInTheDocument();
    expect(within(group).getByLabelText(/^1 Not at all$/)).toBeInTheDocument();
    expect(within(group).getByLabelText(/^5 Very much$/)).toBeInTheDocument();
    const scale = group.querySelector("[data-slot=likert-scale]") as HTMLElement;
    expect(scale.style.getPropertyValue("--points")).toBe("5");
  });

  it("gives every Likert point the check icon and no bar (DR-022)", () => {
    render(<AssessmentForm step="post_test" assessment={assessment} items={items} returnTo="/study/post-test" />);
    const group = screen.getByRole("group", { name: /How much\?/ });
    for (const radio of within(group).getAllByRole("radio")) {
      const cell = radio.closest("label")!;
      // DESIGN.md 9.6: --wash always comes with a check icon; its space is reserved. No bar.
      expect(cell.querySelector("[data-slot=option-check]")).not.toBeNull();
      const classes = cell.className.split(/\s+/);
      expect(classes).toContain("border-b-rule");
      expect(classes).toContain("has-[:checked]:bg-wash");
      expect(classes.some((c) => c.includes("border-l"))).toBe(false);
    }
  });

  it("gives free text at least 132 px and puts the one primary action last, on the right", () => {
    render(<AssessmentForm step="post_test" assessment={assessment} items={items} returnTo="/study/post-test" />);
    expect(screen.getByLabelText(/Why\?/).className).toMatch(/min-h-\[132px\]/);
    const row = document.querySelector("[data-slot=study-actions]") as HTMLElement;
    const buttons = within(row).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Submit answers"]);
    // The primary group sits on the right from 520 px (and stacks full width below).
    expect(buttons[0]!.parentElement!.className).toMatch(/xs:ml-auto/);
    expect(buttons[0]!.parentElement!.className).toMatch(/xs:justify-end/);
  });

  it("after a refused submit, focuses an error summary that links to each question, and describes each field error", async () => {
    actions.submitAssessmentForm.mockResolvedValueOnce({ error: "Some answers need attention.", fieldErrors: { q1: "Choose an answer." } } as never);
    render(<AssessmentForm step="post_test" assessment={assessment} items={items} returnTo="/study/post-test" />);
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "Submit answers" }).closest("form")!);
    });
    const summary = await waitFor(() => {
      const el = document.querySelector("[data-slot=error-summary]") as HTMLElement | null;
      expect(el).not.toBeNull();
      return el!;
    });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(within(summary).getByText("Error")).toBeInTheDocument();
    const link = within(summary).getByRole("link", { name: /Question 1 of 3: Choose an answer\./ });
    expect(link).toHaveAttribute("href", "#q1-a");
    const fieldError = document.getElementById("error-q1")!;
    expect(fieldError).toHaveTextContent("Choose an answer.");
    expect(fieldError.querySelector("svg")).not.toBeNull(); // an icon, never colour alone
    expect(screen.getByRole("group", { name: /Which one\?/ })).toHaveAttribute("aria-describedby", "error-q1");
  });

  it("keeps every answer given after a refused submit (React's automatic form reset is cancelled)", async () => {
    actions.submitAssessmentForm.mockResolvedValueOnce({ error: "Some answers need attention.", fieldErrors: { q1: "Choose an answer." } } as never);
    render(<AssessmentForm step="post_test" assessment={assessment} items={items} returnTo="/study/post-test" />);
    fireEvent.click(screen.getByRole("radio", { name: /^4/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Because." } });
    const submit = screen.getByRole("button", { name: "Submit answers" });
    fireEvent.click(submit);
    await waitFor(() => expect(document.querySelector("[data-slot=error-summary]")).not.toBeNull());
    await waitFor(() => expect(submit).toHaveAttribute("aria-disabled", "false"));
    expect(screen.getByRole("radio", { name: /^4/ })).toBeChecked();
    expect(screen.getByRole("textbox")).toHaveValue("Because.");
  });
});

describe("ConsentForm action row", () => {
  it("puts 'I agree to take part' last in DOM and tab order, with the decline on the left", () => {
    render(<ConsentForm consentVersion="v1" />);
    const row = document.querySelector("[data-slot=study-actions]") as HTMLElement;
    expect(within(row).getAllByRole("button").map((b) => b.textContent)).toEqual(["I do not want to take part", "I agree to take part"]);
  });
});

describe("Study form focus after a submit (WCAG 2.4.3; DESIGN.md 9.1)", () => {
  it("keeps the pressed button focusable while pending and ignores a second submit", async () => {
    let release: (v: object) => void = () => undefined;
    actions.decideConsent.mockImplementationOnce(() => new Promise((r) => (release = r)));
    render(<ConsentForm consentVersion="v1" />);
    const agree = screen.getByRole("button", { name: "I agree to take part" });
    agree.focus();
    fireEvent.click(agree);
    await waitFor(() => expect(agree).toHaveAttribute("aria-disabled", "true"));
    expect(agree).not.toBeDisabled();
    expect(agree).toHaveFocus();
    fireEvent.click(agree);
    expect(actions.decideConsent).toHaveBeenCalledTimes(1);
    await act(async () => release({ error: "Something went wrong." }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
    // A form-level refusal leaves focus where the participant was.
    expect(agree).toHaveFocus();
    expect(agree).toHaveAttribute("aria-disabled", "false");
  });

  it("moves focus to the invalid control after a field refusal", async () => {
    actions.decideConsent.mockResolvedValueOnce({ fieldErrors: { confirm: "Tick the box to confirm." } });
    render(<ConsentForm consentVersion="v1" />);
    const agree = screen.getByRole("button", { name: "I agree to take part" });
    agree.focus();
    fireEvent.click(agree);
    const box = screen.getByRole("checkbox");
    await waitFor(() => expect(box).toHaveFocus());
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("Tick the box to confirm.");
  });

  it("keeps the chosen withdrawal reason after a refusal and focuses the confirmation", async () => {
    actions.withdrawFromStudy.mockResolvedValueOnce({ fieldErrors: { confirm: "Tick the box to confirm that you want to withdraw." } });
    render(<WithdrawForm />);
    fireEvent.click(screen.getByRole("radio", { name: "I do not have time to finish" }));
    const submit = screen.getByRole("button", { name: "Withdraw from the study" });
    submit.focus();
    fireEvent.click(submit);
    const confirm = screen.getByRole("checkbox", { name: "I want to withdraw from the study now." });
    await waitFor(() => expect(confirm).toHaveFocus());
    expect(screen.getByRole("radio", { name: "I do not have time to finish" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "I prefer not to say" })).not.toBeChecked();
  });
});

describe("Display and browser check (DR-019)", () => {
  it("takes no condition input, so it renders identically for both allocations", () => {
    expect(DeviceCheck.length).toBe(0);
    const a = render(<DeviceCheck />);
    const first = a.container.innerHTML;
    a.unmount();
    const b = render(<DeviceCheck />);
    expect(b.container.innerHTML).toBe(first);
  });

  it("offers the High contrast choice once, on the consent page: only that switch, applied at once", async () => {
    const user = userEvent.setup();
    expect(StudyDisplayChoice.length).toBe(0);
    render(<StudyDisplayChoice />);
    expect(screen.getByRole("heading", { level: 2, name: "Display" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=study-contrast-state]")).toHaveTextContent("Off");
    await user.click(screen.getByRole("button", { name: "Display settings" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("switch")).toHaveLength(1);
    await user.click(within(dialog).getByRole("switch", { name: "High contrast" }));
    expect(document.documentElement).toHaveClass("a11y-contrast");
    expect(document.documentElement).not.toHaveClass("dark");
    await user.click(within(dialog).getAllByRole("button", { name: "Close" })[0]!);
    expect(document.querySelector("[data-slot=study-contrast-state]")).toHaveTextContent("On");
  });

  it("shows the choice read-only at the check (no second switch) and records it with the check", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("ie-display", JSON.stringify({ contrast: true, reduceMotion: false }));
    render(<DeviceCheck />);
    expect(screen.getByRole("heading", { level: 2, name: "Display" })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=study-display-record] [data-slot=study-contrast-state]")).toHaveTextContent("On");
    expect(screen.queryByRole("button", { name: "Display settings" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    // Nothing is submitted until the participant continues.
    expect(actions.submitDeviceCheck).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Check and continue" }));
    await waitFor(() => expect(actions.submitDeviceCheck).toHaveBeenCalledTimes(1));
    expect(actions.submitDeviceCheck).toHaveBeenCalledWith(expect.objectContaining({ contrastAccommodation: true }));
    // A failed check explains itself in words and offers to check again, from the same button,
    // which kept focus throughout (aria-disabled while checking, never natively disabled).
    expect(await screen.findByText(/too small for this study/)).toBeInTheDocument();
    const again = screen.getByRole("button", { name: "Check again" });
    expect(again).not.toBeDisabled();
    expect(again).toHaveFocus();
  });

  it("records Off when no choice was made", async () => {
    render(<DeviceCheck />);
    expect(document.querySelector("[data-slot=study-contrast-state]")).toHaveTextContent("Off");
    await userEvent.setup().click(screen.getByRole("button", { name: "Check and continue" }));
    await waitFor(() => expect(actions.submitDeviceCheck).toHaveBeenCalledWith(expect.objectContaining({ contrastAccommodation: false })));
  });
});

describe("stepCountOf", () => {
  const steps = ["questionnaire_pre", "pre_test", "onboarding", "learning"] as const;
  it("numbers protocol steps 1-based against the protocol length", () => {
    expect(stepCountOf(steps, { kind: "step", step: "pre_test", index: 1 })).toEqual({ current: 2, total: 4 });
  });
  it("shows no count for positions outside the step list", () => {
    expect(stepCountOf(steps, { kind: "device_check" })).toBeNull();
    expect(stepCountOf(steps, { kind: "allocation" })).toBeNull();
    expect(stepCountOf(steps, { kind: "finish" })).toBeNull();
  });
});
