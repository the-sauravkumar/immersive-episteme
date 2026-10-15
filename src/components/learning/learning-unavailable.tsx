import { StateMessage } from "@/components/knowledge/state-message";
import { UNAVAILABLE_TEXT } from "@/features/learning/strings";

/**
 * "Learning content is not available" (DESIGN.md 9.7, 12.1 rule 1, P23): ONE message for both
 * conditions, so the 2D content-unavailable page and the museum's unavailable screen render the
 * same StateMessage with the same id, wording, detail line and live region. Each condition keeps
 * only its own placement around it. Server-safe; no outbound navigation (study surfaces have none).
 */
export function LearningUnavailable({ reason }: { reason: string }) {
  const text = reason === "session_not_found" ? UNAVAILABLE_TEXT.session_not_found : UNAVAILABLE_TEXT.no_content;
  return (
    <StateMessage id="learning-unavailable-title" title={UNAVAILABLE_TEXT.title} tone="info" detail={`Reason: ${reason}.`} live="status">
      <p>{text}</p>
    </StateMessage>
  );
}
