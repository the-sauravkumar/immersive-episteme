/**
 * Result of a CMS / admin server action, consumed by `useActionState` in client forms.
 * Client-safe (no server imports).
 */
export type ActionState = {
  ok: boolean;
  /** Success message (shown in a polite live region). */
  message?: string;
  /** Refusal message (shown in an alert that receives focus). */
  error?: string;
  /** Stable refusal code (CmsError.code), e.g. "self_verification". */
  code?: string;
  /** Per-field validation messages keyed by the form field name (dotted path). */
  fieldErrors?: Record<string, string[]>;
  /** Small serialisable payload (e.g. the id of a created row, a presigned URL). */
  data?: Record<string, unknown>;
} | null;
