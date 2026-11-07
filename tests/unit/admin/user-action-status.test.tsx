import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { UserActionStatus, UserRowActions } from "@/components/admin/user-forms";

const grant = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, message: "Researcher role granted." })));

vi.mock("@/server/admin/actions", () => ({
  clearSignInLockAction: vi.fn(),
  createStaffAction: vi.fn(),
  resetPasswordAction: vi.fn(),
  grantRoleAction: grant,
  lockStaffAction: vi.fn(),
  revokeRoleAction: vi.fn(),
  unlockStaffAction: vi.fn(),
}));

const WAITING = { id: "u-1", name: "Waiting Person", email: "waiting@example.test", roles: [], locked: false, signInLocked: false, hasPassword: false };

function AwaitingAccessList() {
  const [rows, setRows] = useState([WAITING]);
  grant.mockImplementationOnce(async () => {
    setRows([]);
    return { ok: true as const, message: "Researcher role granted." };
  });
  return (
    <UserActionStatus>
      {rows.length ? rows.map((u) => <UserRowActions key={u.id} user={u} self={false} manageRoles minPasswordLength={12} />) : <p>No accounts match these filters.</p>}
    </UserActionStatus>
  );
}

describe("UserActionStatus", () => {
  it("is one polite live region, present and empty before any action", () => {
    render(
      <UserActionStatus>
        <UserRowActions user={WAITING} self={false} manageRoles minPasswordLength={12} />
        <UserRowActions user={{ ...WAITING, id: "u-2", email: "other@example.test" }} self={false} manageRoles minPasswordLength={12} />
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

  it("offers to lift a sign-in lock and reset a password only when they apply (DR-114)", async () => {
    const user = userEvent.setup();
    render(
      <UserActionStatus>
        <UserRowActions user={{ ...WAITING, signInLocked: true, hasPassword: true }} self={false} manageRoles minPasswordLength={12} />
      </UserActionStatus>,
    );
    await user.click(screen.getByRole("button", { name: "Manage Waiting Person (waiting@example.test)" }));
    expect(await screen.findByRole("menuitem", { name: "Lift sign-in lock…" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Reset password…" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
  });

  it("hides both when the account has no lock and no password", async () => {
    const user = userEvent.setup();
    render(
      <UserActionStatus>
        <UserRowActions user={WAITING} self={false} manageRoles minPasswordLength={12} />
      </UserActionStatus>,
    );
    await user.click(screen.getByRole("button", { name: "Manage Waiting Person (waiting@example.test)" }));
    await screen.findByRole("menuitem", { name: "Add a role…" });
    expect(screen.queryByRole("menuitem", { name: "Lift sign-in lock…" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Reset password…" })).toBeNull();
  });

  it("refuses a row rendered outside the list's live region", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<UserRowActions user={WAITING} self={false} manageRoles minPasswordLength={12} />)).toThrow("UserRowActions must sit inside UserActionStatus.");
  });
});
