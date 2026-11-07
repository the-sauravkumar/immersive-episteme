import type { HistoryEntry } from "@/server/cms/queries";

import { Empty, Stamp } from "./bits";

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <Empty>No history yet.</Empty>;
  return (
    <ol className="flex flex-col">
      {entries.map((e, i) => (
        <li key={i} className="grid grid-cols-1 gap-x-4 border-t border-line py-2 first:border-t-0 first:pt-0 xs:grid-cols-[9.5rem_minmax(0,1fr)]">
          <span>
            <Stamp at={e.at} />
            <span className="sr-only"> UTC</span>
          </span>
          <div className="t-b min-w-0">
            <p>
              <span className="font-medium text-lime">{e.what}</span> <span className="text-lime-dim">by {e.actor ?? "system"}</span>
            </p>
            {e.reason ? <p className="text-lime-dim">“{e.reason}”</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
