import { StateMessage } from "@/components/knowledge/state-message";

export function PracticeUnavailable({ message }: { message: string }) {
  return (
    <div className="px-4 py-16 xs:px-6">
      <StateMessage id="practice-unavailable-title" title="The practice is not available" tone="info">
        <p>{message}</p>
      </StateMessage>
    </div>
  );
}
