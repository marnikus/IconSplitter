// ScanRow.tsx owns one review row: thumbnail, names, status, select, copy-path.

import type { TrackState } from "../../batch/status";
import { isEligible, type BatchItem } from "../../batch/reducer";
import { copyDisplayPath, type Say } from "./scanFlow";

interface Props {
  item: BatchItem;
  index: number;
  rootName: string;
  picked: boolean;
  say: Say;
  onToggle: (relPath: string) => void;
}

function statusTone(state: TrackState): string {
  const tones: Record<TrackState, string> = {
    unprocessed: "bg-white/10 text-slate-200",
    processed: "bg-emerald-500/20 text-emerald-300",
    skipped: "bg-amber-500/20 text-amber-300",
    missing: "bg-rose-500/20 text-rose-300",
    changed: "bg-indigo-500/20 text-indigo-300",
    deleted: "bg-slate-500/20 text-slate-400",
  };
  return `shrink-0 rounded-full px-2 py-0.5 text-xs ${tones[state]}`;
}

export default function ScanRow(props: Props) {
  const item = props.item;
  return (
    <div data-testid={`batch-row-${props.index}`} className="flex items-center gap-3 rounded-xl border border-white/10 p-2">
      <input data-testid={`batch-select-${props.index}`} type="checkbox" checked={props.picked} disabled={!isEligible(item)} onChange={() => props.onToggle(item.relPath)} className="h-4 w-4 shrink-0 accent-indigo-500" />
      {item.thumbUrl ? <img src={item.thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white object-contain" /> : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white/10 text-lg">🖼️</div>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="truncate text-xs text-slate-400">{item.relPath}</p>
        <p className="truncate text-xs text-slate-500">ref: {item.referenceName}{item.referenceFound ? "" : " (missing)"}</p>
        {item.note && <p className="truncate text-xs text-amber-300">{item.note}</p>}
      </div>
      <span className={statusTone(item.state)}>{item.state}</span>
      <button data-testid={`batch-copy-path-${props.index}`} onClick={() => void copyDisplayPath(item, props.rootName, props.say)} className="btn-mini shrink-0" title="Browsers cannot open File Explorer — copies the path instead">📋 Path</button>
    </div>
  );
}
