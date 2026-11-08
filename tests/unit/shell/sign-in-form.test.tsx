import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "@/components/shell/sign-in-form";

const navigation = vi.hoisted(() => ({ search: new URLSearchParams() }));
const client = vi.hoisted(() => ({
  social: vi.fn(async () => ({ data: null, error: null })),
  email: vi.fn(async () => ({ data: null, error: null })),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navigation.search,
}));
vi.mock("@/components/shell/auth-client", () => ({
  authClient: { signIn: { social: client.social, email: client.email } },
}));

beforeEach(() => {
  navigation.search = new URLSearchParams();
  client.social.mockClear();
  client.email.mockClear();
});

describe("SignInForm and Google", () => {
  it("shows no Google button when Google is not configured", () => {
    render(<SignInForm google={false} />);
    expect(screen.queryByRole("button", { name: /google/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("shows Continue with Google, with the standard logo, when Google is configured", () => {
    const { container } = render(<SignInForm google />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button.getAttribute("type")).toBe("button");
    const logo = container.querySelector('[data-slot="google-logo"]');
    expect(logo?.getAttribute("aria-hidden")).toBe("true");
    expect([...(logo?.querySelectorAll("path") ?? [])].map((p) => p.getAttribute("fill"))).toEqual([
      "var(--google-red)",
      "var(--google-blue)",
      "var(--google-yellow)",
      "var(--google-green)",
    ]);
  });

  it("starts Google sign-in with new accounts sent to the waiting page and errors back to sign-in", async () => {
    navigation.search = new URLSearchParams("next=/research/studies");
    render(<SignInForm google />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(client.social).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/research/studies",
      newUserCallbackURL: "/awaiting-access",
      errorCallbackURL: "/sign-in?next=%2Fresearch%2Fstudies",
    });
  });

  it("explains a refused Google callback", () => {
    navigation.search = new URLSearchParams("error=account_not_linked");
    render(<SignInForm google />);
    expect(screen.getByRole("alert").textContent).toMatch(/Google has not verified the address/);
  });

  it("ignores Google error codes when Google is not configured", () => {
    navigation.search = new URLSearchParams("error=account_not_linked");
    render(<SignInForm google={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
