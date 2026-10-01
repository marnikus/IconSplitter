// OrphanHistory.tsx — decisions whose files are no longer on disk stay visible
// and stay in the review file (spec §9); this is where the user can see them.

import { useState } from "react";
import StatusBadge from "./StatusBadge";
import type { DecisionRecord } from "../lib/reviewfile";

export default function OrphanHistory({ records }: { records: DecisionRecord[] }) {
  const [open, setOpen] = useState(false);
  if (records.length === 0) return null;
  return (
    <section className="panel" data-testid="review-orphans">
      <button type="button" className="flex w-full items-center gap-2 text-left text-sm text-slate-300"
        aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        Decisions for files no longer on disk ({records.length}) — kept in the review file
      </button>
      {open && <List records={records} />}
    </section>
  );
}

function List({ records }: { records: DecisionRecord[] }) {
  return (
    <ul className="mt-2 space-y-1 text-xs text-slate-400">
      {records.slice(0, 100).map((record) => (
        <li key={record.pair_id} className="flex items-center gap-2">
          <StatusBadge status={record.decision} />
          <span className="truncate">{record.source || record.ai_result || record.pair_id}</span>
        </li>
      ))}
    </ul>
  );
}
