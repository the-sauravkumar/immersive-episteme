const MESSAGES: Readonly<Record<string, string>> = {
  access_denied: "Google sign-in was cancelled. Choose an account to continue, or sign in with your email.",
  account_not_linked:
    "A staff account already uses this email, but Google has not verified the address, so the two were not joined. Sign in with your email and password.",
  unable_to_link_account:
    "A staff account already uses this email, but Google has not verified the address, so the two were not joined. Sign in with your email and password.",
  unable_to_create_user: "Google has not verified this email address, so no account was made. Use a Google account with a verified email.",
  unable_to_create_session: "This account cannot sign in. If it has been locked, ask a platform administrator.",
  account_already_linked_to_different_user: "This Google account is already joined to another staff account.",
};

const FALLBACK = "Google sign-in did not finish. Try again, or sign in with your email.";

export function googleSignInErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? FALLBACK;
}
