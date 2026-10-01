// StatusFooter.tsx — bottom status bar: rescan age, diff counts, retry
// warning, reviewed progress bar (RULE 5/24 honest surfaces).

import { useEffect, useState } from "react";
import { counters, type SelState } from "./state";

export default function StatusFooter({ s }: { s: SelState }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const c = counters(s.pairs);
  const reviewed = c.approved + c.declined;
  const pct = c.total ? Math.round((reviewed / c.total) * 100) : 0;
  const age = s.lastRescanAt ? Math.max(0, Math.round((Date.now() - s.lastRescanAt) / 1000)) : null;
  return (
    <footer className="panel flex flex-wrap items-center gap-3 text-xs text-slate-400" data-testid="sel-footer">
      <span className="text-emerald-300">●</span> Recursive index ready
      {age !== null && <span data-testid="sel-rescan-age">Last rescan: {age} seconds ago</span>}
      <span data-testid="sel-diff">
        +{s.lastDiff.added} new · {s.lastDiff.renamed} renamed · {s.lastDiff.removed} removed · {s.lastDiff.unchanged} unchanged
      </span>
      <span className="ml-auto flex items-center gap-3">
        {s.awaitingRetry > 0 && (
          <span className="text-amber-300" data-testid="sel-retry-count">{s.awaitingRetry} decision{awaitPlural(s.awaitingRetry)} awaiting retry</span>
        )}
        <span data-testid="sel-progress">{reviewed} / {c.total} reviewed</span>
        <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full bg-indigo-400" style={{ width: `${pct}%` }} />
        </span>
      </span>
    </footer>
  );
}

function awaitPlural(n: number): string {
  return n === 1 ? "" : "s";
}
