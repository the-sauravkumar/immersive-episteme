/** Result of a research-console Server Action, shown by <ActionForm>. */
export interface ActionState {
  status: "idle" | "ok" | "error";
  message: string;
  details?: string[];
}

export const IDLE: ActionState = { status: "idle", message: "" };
