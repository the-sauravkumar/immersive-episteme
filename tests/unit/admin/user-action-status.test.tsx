import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { UserActionStatus, UserRowActions } from "@/components/admin/user-forms";

const grant = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, message: "Researcher role granted." })));

vi.mock("@/server/admin/actions", () => ({
  createStaffAction: vi.fn(),
  grantRoleAction: grant,
  lockStaffAction: vi.fn(),
  revokeRoleAction: vi.fn(),
  unlockStaffAction: vi.fn(),
}));

const WAITING = { id: "u-1", name: "Waiting Person", email: "waiting@example.test", roles: [], locked: false };

function AwaitingAccessList() {
  const [rows, setRows] = useState([WAITING]);
  grant.mockImplementationOnce(async () => {
    setRows([]);
    return { ok: true as const, message: "Researcher role granted." };
  });
  return (
    <UserActionStatus>
      {rows.length ? rows.map((u) => <UserRowActions key={u.id} user={u} self={false} manageRoles />) : <p>No accounts match these filters.</p>}
    </UserActionStatus>
  );
}

describe("UserActionStatus", () => {
  it("is one polite live region, present and empty before any action", () => {
    render(
      <UserActionStatus>
        <UserRowActions user={WAITING} self={false} manageRoles />
        <UserRowActions user={{ ...WAITING, id: "u-2", email: "other@example.test" }} self={false} manageRoles />
      </UserActionStatus>,
    );
    const regions = screen.getAllByRole("status");
    expect(regions).toHaveLength(1);
    expect(regions[0]).toHaveAttribute("aria-live", "polite");
    expect(regions[0]).toBeEmptyDOMElement();
  });

  it("keeps the grant confirmation after the granted row leaves a filtered list", async () => {
    const user = userEvent.setup();
    render(<AwaitingAccessList />);
    await user.click(screen.getByRole("button", { name: "Manage Waiting Person (waiting@example.test)" }));
    await user.click(await screen.findByRole("menuitem", { name: "Add a role…" }));
    const dialog = await screen.findByRole("dialog", { name: /^add a role$/i });
    await user.selectOptions(dialog.querySelector("select")!, "researcher");
    await user.click(screen.getByRole("button", { name: "Add role" }));
    await waitFor(() => expect(screen.getByText("No accounts match these filters.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Manage Waiting Person/ })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting Person (waiting@example.test): Researcher role granted.");
  });

  it("refuses a row rendered outside the list's live region", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<UserRowActions user={WAITING} self={false} manageRoles />)).toThrow("UserRowActions must sit inside UserActionStatus.");
  });
});
