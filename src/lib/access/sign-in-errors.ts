export const ACCOUNT_THROTTLED_CODE = "ACCOUNT_THROTTLED";

export function accountThrottledMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many sign-in attempts for this account. It is locked for ${minutes === 1 ? "1 more minute" : `${minutes} more minutes`}. An administrator can lift the lock in Admin > Users.`;
}

export type SignInError = { status?: number; code?: string; message?: string };

const NETWORK_LIMIT = "Too many sign-in attempts from this network. Wait a minute and try again.";

export function signInErrorMessage(err: SignInError): string {
  if (err.status === 429) return err.code === ACCOUNT_THROTTLED_CODE && err.message ? err.message : NETWORK_LIMIT;
  if (err.status === 401 || err.status === 403) return "That email and password do not match an active staff account.";
  return err.message ?? "Sign-in failed. Try again.";
}

export function googleStartErrorMessage(status: number | undefined): string {
  if (status === 429) return NETWORK_LIMIT;
  return "Google sign-in could not start. Try again, or sign in with your email.";
}
