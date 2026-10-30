// BatchDestRow.tsx — compact row for output destination, keeps controls accessible
// Shows Auto: <folder>/_split_output + grouped info + Choose destination button in one responsive row.

export interface BatchDestRowProps {
  rootName: string;
  destName: string;
  destMode: string;
  chooseDest: () => void;
}

export default function BatchDestRow(p: BatchDestRowProps) {
  const custom = p.destMode === "custom" && p.destName;
  return (
    <section className="panel flex flex-wrap items-center gap-3 text-sm" data-testid="batch-dest-row">
      <h3 className="panel-title !mb-0">Output</h3>
      <span className="text-slate-400">
        {custom ? <>Custom: <b className="text-slate-200">{p.destName}</b></> : <>Auto: <b className="text-slate-200">{p.rootName || "<folder>"}/_split_output</b></>}
      </span>
      <span className="text-xs text-slate-500">Grouped YYYY-MM / YYYY-MM-DD (one folder per day), hierarchy preserved, never overwritten.</span>
      <button data-testid="batch-dest" className="btn-ghost ml-auto" onClick={p.chooseDest}>Choose destination…</button>
    </section>
  );
}
