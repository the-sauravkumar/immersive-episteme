import { StateMessage } from "@/components/knowledge/state-message";
import { UNAVAILABLE_TEXT } from "@/features/learning/strings";

export function LearningUnavailable({ reason }: { reason: string }) {
  const text = reason === "session_not_found" ? UNAVAILABLE_TEXT.session_not_found : UNAVAILABLE_TEXT.no_content;
  return (
    <StateMessage id="learning-unavailable-title" title={UNAVAILABLE_TEXT.title} tone="info" detail={`Reason: ${reason}.`} live="status">
      <p>{text}</p>
    </StateMessage>
  );
}
