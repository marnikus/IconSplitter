// ProcessBar.tsx owns batch execution controls + missing-reference confirm.

import type { BatchItem } from "../../batch/reducer";

interface Props {
  count: number;
  busy: boolean;
  confirm: BatchItem[] | null;
  onProcess: () => void;
  onCancel: () => void;
  onConfirm: (allow: boolean) => void;
}

function MissingConfirm(props: { items: BatchItem[]; onConfirm: (allow: boolean) => void }) {
  return (
    <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3">
      <p className="text-sm">Reference image missing for {props.items.length} selected file{props.items.length === 1 ? "" : "s"}: {props.items.map((i) => i.name).join(", ")}</p>
      <div className="mt-2 flex gap-2">
        <button data-testid="batch-missing-skip" onClick={() => props.onConfirm(false)} className="btn-ghost">Skip those</button>
        <button data-testid="batch-missing-continue" onClick={() => props.onConfirm(true)} className="btn-primary">Continue anyway</button>
      </div>
    </div>
  );
}

export default function ProcessBar(props: Props) {
  return (
    <section className="panel">
      <div className="flex flex-wrap items-center gap-2">
        <button data-testid="batch-process" disabled={props.busy || !props.count} onClick={props.onProcess} className="btn-primary">⚙ Process selected ({props.count})</button>
        {props.busy && <button data-testid="batch-cancel" onClick={props.onCancel} className="btn-ghost">✕ Cancel</button>}
      </div>
      {props.confirm && <MissingConfirm items={props.confirm} onConfirm={props.onConfirm} />}
    </section>
  );
}
