import { StateMessage } from "@/components/knowledge/state-message";

/**
 * Shown by both practice pages when the practice cannot run (the reason is in `message`), through
 * the shared StateMessage (DESIGN.md 9.7), so it is identical in both conditions.
 */
export function PracticeUnavailable({ message }: { message: string }) {
  return (
    <div className="px-4 py-16 xs:px-6">
      <StateMessage id="practice-unavailable-title" title="The practice is not available" tone="info">
        <p>{message}</p>
      </StateMessage>
    </div>
  );
}
