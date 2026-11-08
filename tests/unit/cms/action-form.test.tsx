import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ActionForm } from "@/components/cms/action-form";

vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));

describe("CMS ActionForm", () => {
  it("keeps what the curator typed when the action refuses it", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ ok: false as const, code: "invalid_input", error: "Check the highlighted fields." }));
    render(
      <ActionForm action={action} submitLabel="Save">
        <input aria-label="URL" name="url" defaultValue="" />
      </ActionForm>,
    );
    await user.type(screen.getByRole("textbox", { name: "URL" }), "not a url");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Check the highlighted fields.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "URL" })).toHaveValue("not a url");
  });

  it("clears the fields after a success when asked to", async () => {
    const user = userEvent.setup();
    render(
      <ActionForm action={async () => ({ ok: true as const, message: "Saved." })} submitLabel="Save" resetOnSuccess>
        <input aria-label="Title" name="title" defaultValue="" />
      </ActionForm>,
    );
    await user.type(screen.getByRole("textbox", { name: "Title" }), "New title");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("");
  });
});
