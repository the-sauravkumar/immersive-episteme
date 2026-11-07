import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChangePasswordDialog } from "@/components/shell/change-password";
import { ErrorState } from "@/components/shell/error-state";
import { SignOutButton } from "@/components/shell/sign-out-button";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const client = vi.hoisted(() => ({
  signOut: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: { success: true }, error: null })),
  changePassword: vi.fn(async (_input: unknown): Promise<{ data: unknown; error: unknown }> => ({ data: {}, error: null })),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/shell/auth-client", () => ({ authClient: client }));

beforeEach(() => {
  router.replace.mockClear();
  router.refresh.mockClear();
  client.signOut.mockReset();
  client.changePassword.mockReset();
});

describe("sign-out (DR-114)", () => {
  it("goes to the sign-in page only when the server ended the session", async () => {
    client.signOut.mockResolvedValue({ data: { success: true }, error: null });
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("stays put and says the session is still open when the server refuses", async () => {
    client.signOut.mockResolvedValue({ data: null, error: { status: 429, message: "Too many requests" } });
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText(/you are still signed in/)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("recovers from a network failure instead of hanging on Signing out", async () => {
    client.signOut.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<SignOutButton />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByText(/you are still signed in/)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("change password dialog", () => {
  const fill = async (current: string, next: string, repeat: string) => {
    await userEvent.type(screen.getByLabelText("Current password"), current);
    await userEvent.type(screen.getByLabelText("New password"), next);
    await userEvent.type(screen.getByLabelText("Repeat the new password"), repeat);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
  };

  it("changes the password through Better Auth and ends the other sessions", async () => {
    client.changePassword.mockResolvedValue({ data: {}, error: null });
    render(<ChangePasswordDialog open onOpenChange={() => undefined} minPasswordLength={12} />);
    await fill("old-password-123", "new-password-456", "new-password-456");
    expect(await screen.findByText("Password Changed")).toBeTruthy();
    expect(client.changePassword).toHaveBeenCalledWith({ currentPassword: "old-password-123", newPassword: "new-password-456", revokeOtherSessions: true });
  });

  it("refuses mismatched passwords without calling the server, and reports a wrong current password", async () => {
    render(<ChangePasswordDialog open onOpenChange={() => undefined} minPasswordLength={12} />);
    await fill("old-password-123", "new-password-456", "new-password-789");
    expect(await screen.findByText("The two new passwords do not match.")).toBeTruthy();
    expect(client.changePassword).not.toHaveBeenCalled();
  });
});

describe("error boundary", () => {
  it("offers a retry and a way home, with the server's reference", async () => {
    const retry = vi.fn();
    const error = Object.assign(new Error("hidden"), { digest: "abc123" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ErrorState error={error} retry={retry} homeHref="/cms" homeLabel="Go to the content console" />);
    expect(screen.getByRole("heading", { level: 1, name: "Something Went Wrong" })).toBeTruthy();
    expect(screen.getByText(/abc123/)).toBeTruthy();
    expect(screen.queryByText("hidden")).toBeNull();
    expect(screen.getByRole("link", { name: "Go to the content console" }).getAttribute("href")).toBe("/cms");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
