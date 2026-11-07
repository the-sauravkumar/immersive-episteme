import { describe, expect, it } from "vitest";

import { changePasswordErrorMessage, changePasswordProblem } from "@/lib/access/change-password";
import { accountThrottledMessage, ACCOUNT_THROTTLED_CODE, googleStartErrorMessage, signInErrorMessage } from "@/lib/access/sign-in-errors";
import { DEFAULT_ACCOUNT_THROTTLE } from "@/server/auth/account-throttle";

describe("sign-in refusals say what actually happened (DR-114)", () => {
  it("tells a locked account how long the lock lasts and who can lift it, not to wait a minute", () => {
    const message = accountThrottledMessage(DEFAULT_ACCOUNT_THROTTLE.lockSeconds);
    expect(message).toContain("15 more minutes");
    expect(message).toContain("Admin > Users");
    expect(signInErrorMessage({ status: 429, code: ACCOUNT_THROTTLED_CODE, message })).toBe(message);
    expect(signInErrorMessage({ status: 429, code: ACCOUNT_THROTTLED_CODE, message })).not.toContain("Wait a minute");
    expect(accountThrottledMessage(30)).toContain("1 more minute.");
  });

  it("keeps the one-minute advice for the per-network limit only", () => {
    expect(signInErrorMessage({ status: 429 })).toBe("Too many sign-in attempts from this network. Wait a minute and try again.");
    expect(googleStartErrorMessage(429)).toContain("Wait a minute");
    expect(signInErrorMessage({ status: 401 })).toBe("That email and password do not match an active staff account.");
  });
});

describe("change password checks", () => {
  const ok = { currentPassword: "old-password-123", newPassword: "new-password-456", repeatPassword: "new-password-456" };

  it("accepts a valid change and names the field of each problem", () => {
    expect(changePasswordProblem(ok, 12)).toBeNull();
    expect(changePasswordProblem({ ...ok, currentPassword: "" }, 12)?.field).toBe("currentPassword");
    expect(changePasswordProblem({ ...ok, newPassword: "short", repeatPassword: "short" }, 12)?.field).toBe("newPassword");
    expect(changePasswordProblem({ ...ok, newPassword: ok.currentPassword, repeatPassword: ok.currentPassword }, 12)?.field).toBe("newPassword");
    expect(changePasswordProblem({ ...ok, repeatPassword: "different-1234" }, 12)?.field).toBe("repeatPassword");
  });

  it("explains the server's refusals", () => {
    expect(changePasswordErrorMessage({ status: 400, code: "INVALID_PASSWORD" })).toContain("current password is not right");
    expect(changePasswordErrorMessage({ status: 400, code: "PASSWORD_TOO_SHORT" })).toContain("too short");
    expect(changePasswordErrorMessage({ status: 429 })).toContain("Wait a minute");
    expect(changePasswordErrorMessage({ status: 500 })).toContain("Nothing was changed");
  });
});
