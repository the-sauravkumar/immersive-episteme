import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button (shadcn, radix-nova)", () => {
  it("renders an accessible button and handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue</Button>);
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("data-slot", "button");
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
