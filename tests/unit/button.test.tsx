import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button, buttonVariants } from "@/components/ui/button";

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

describe("Button sizes (DESIGN.md Section 6)", () => {
  const classes = (size: Parameters<typeof buttonVariants>[0]) =>
    buttonVariants(size).split(/\s+/);

  it("size default is at least 46 px tall", () => {
    expect(classes({ size: "default" })).toContain("min-h-[46px]");
  });

  it("size icon is 44 x 44", () => {
    expect(classes({ size: "icon" })).toContain("size-11");
  });

  it("compact is 36 px visual with a 44 x 44 hit area", () => {
    const c = classes({ size: "compact" });
    expect(c).toContain("min-h-9");
    expect(c).toContain("relative");
    expect(c).toEqual(expect.arrayContaining(["after:absolute", "after:min-h-11", "after:min-w-11"]));
  });

  it("never translates on press and draws no ring of its own (the global focus ring applies)", () => {
    for (const variant of ["default", "outline", "ghost", "link", "destructive"] as const) {
      const c = buttonVariants({ variant });
      expect(c).not.toMatch(/translate-y/);
      expect(c).not.toMatch(/focus-visible:ring/);
    }
  });

  it("the outline variant renders the 2 px lime border of DESIGN.md Section 6 (DR-119)", () => {
    render(<Button variant="outline">B</Button>);
    const cls = screen.getByRole("button", { name: "B" }).className;
    expect(cls).toContain("border-2");
    expect(cls).toContain("border-lime");
    expect(cls).not.toMatch(/outline-none/);
  });
});
