export interface SessionOutcome {
  readonly title: string;
  readonly body: string;
  readonly tone: "done" | "info";
  readonly known: boolean;
  readonly offersWithdrawal: boolean;
}

const OUTCOMES: Readonly<Record<string, SessionOutcome>> = {
  completed: {
    title: "Your session is complete",
    body: "Thank you for taking part. Your answers have been recorded. You can close this window.",
    tone: "done",
    known: true,
    offersWithdrawal: false,
  },
  declined: {
    title: "You chose not to take part",
    body: "Nothing else will be asked of you. You can close this window.",
    tone: "info",
    known: true,
    offersWithdrawal: false,
  },
  withdrawn: {
    title: "You have withdrawn from the study",
    body: "Your withdrawal has been recorded and the session has ended. Answers given before you withdrew are kept as described in the information you were given; ask the facilitator if you have questions about them. You can close this window.",
    tone: "info",
    known: true,
    offersWithdrawal: false,
  },
  ended: {
    title: "This session cannot be continued",
    body: "The study does not allow this session to be resumed. Please speak to the facilitator. You can close this window.",
    tone: "info",
    known: true,
    offersWithdrawal: false,
  },
  excluded: {
    title: "This study cannot continue on this device",
    body: "Please speak to the facilitator. You can still withdraw from the study, and the answers you gave are then handled as described in the information you were given.",
    tone: "info",
    known: true,
    offersWithdrawal: true,
  },
};

const NO_OUTCOME: SessionOutcome = {
  title: "There is no session result to show",
  body: "This page shows how a study session ended, and this link does not name one. If you are taking part, open the study page or speak to the facilitator.",
  tone: "info",
  known: false,
  offersWithdrawal: false,
};

export function sessionOutcome(status: unknown): SessionOutcome {
  return typeof status === "string" && Object.hasOwn(OUTCOMES, status) ? OUTCOMES[status]! : NO_OUTCOME;
}
