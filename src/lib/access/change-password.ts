export type ChangePasswordFields = { currentPassword: string; newPassword: string; repeatPassword: string };

export type ChangePasswordProblem = { field: keyof ChangePasswordFields; message: string };

export function changePasswordProblem(fields: ChangePasswordFields, minLength: number): ChangePasswordProblem | null {
  if (!fields.currentPassword) return { field: "currentPassword", message: "Enter your current password." };
  if (fields.newPassword.length < minLength) return { field: "newPassword", message: `Use at least ${minLength} characters.` };
  if (fields.newPassword.length > 256) return { field: "newPassword", message: "Use at most 256 characters." };
  if (fields.newPassword === fields.currentPassword) return { field: "newPassword", message: "Choose a password different from the current one." };
  if (fields.repeatPassword !== fields.newPassword) return { field: "repeatPassword", message: "The two new passwords do not match." };
  return null;
}

export function changePasswordErrorMessage(err: { status?: number; code?: string; message?: string }): string {
  if (err.status === 429) return "Too many attempts. Wait a minute and try again.";
  if (err.code === "INVALID_PASSWORD") return "The current password is not right. Nothing was changed.";
  if (err.code === "PASSWORD_TOO_SHORT" || err.code === "PASSWORD_TOO_LONG") return "The new password is too short or too long. Nothing was changed.";
  if (err.status === 401) return "Your session has ended. Sign in again, then change your password.";
  return "The password could not be changed. Nothing was changed; try again.";
}
