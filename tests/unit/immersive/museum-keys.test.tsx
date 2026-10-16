/**
 * Final review novice-3d-arrow-keys-dead-after-bar-buttons: after a click on a StudyBar toggle
 * (Plan, In This Room, Controls help) or with the rail's heading focused, the arrow and WASD keys
 * still walk the visitor. Controls that use arrows themselves keep them: text fields, the rail's
 * rows (a list), and the panel, the Plan and the screens ("ui" regions).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { isTypingTarget } from "@/components/museum/keys";

function dom() {
  render(
    <div>
      <div data-museum-keys="bar">
        <button type="button">Plan</button>
        <button type="button" aria-haspopup="dialog">
          Hint
        </button>
      </div>
      <nav data-museum-keys="rail">
        <h2 tabIndex={-1}>In This Room</h2>
        <button type="button">Hide</button>
        <ul>
          <li>
            <button type="button">Row</button>
          </li>
        </ul>
      </nav>
      <section data-museum-keys="ui">
        <button type="button">Close</button>
      </section>
      <input aria-label="field" />
      <p>scene</p>
    </div>,
  );
}

describe("movement keys after a bar or rail click", () => {
  it("pass plain toggles in the bar and the rail's heading and Hide button through to the walk", () => {
    dom();
    expect(isTypingTarget(screen.getByRole("button", { name: "Plan" }))).toBe(false);
    expect(isTypingTarget(screen.getByRole("heading", { name: "In This Room" }))).toBe(false);
    expect(isTypingTarget(screen.getByRole("button", { name: "Hide" }))).toBe(false);
    expect(isTypingTarget(screen.getByText("scene"))).toBe(false);
  });

  it("stay with controls that use arrows themselves", () => {
    dom();
    expect(isTypingTarget(screen.getByRole("button", { name: "Hint" }))).toBe(true);
    expect(isTypingTarget(screen.getByRole("button", { name: "Row" }))).toBe(true);
    expect(isTypingTarget(screen.getByRole("button", { name: "Close" }))).toBe(true);
    expect(isTypingTarget(screen.getByRole("textbox", { name: "field" }))).toBe(true);
  });
});
