export type ActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  data?: Record<string, unknown>;
} | null;
