export const REQUIRED_ANSWER_MESSAGE = "Answer this question to continue.";

export const REQUIRED_ANSWERS_SUMMARY = "Every question in this part needs an answer.";

const EMPTY_SKETCH = "[]";

function answerIsBlank(kind: string, values: readonly string[]): boolean {
  const given = values.map((value) => value.trim()).filter((value) => value.length > 0);
  if (given.length === 0) return true;
  return kind === "sketch" && given.length === 1 && given[0] === EMPTY_SKETCH;
}

export function unansweredItems(items: readonly { readonly id: string; readonly kind: string }[], valuesOf: (itemId: string) => readonly string[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const item of items) if (answerIsBlank(item.kind, valuesOf(item.id))) errors[item.id] = REQUIRED_ANSWER_MESSAGE;
  return errors;
}
