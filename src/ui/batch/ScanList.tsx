// ScanList.tsx owns the review window: rows plus select-all/deselect-all.

import { isEligible, type BatchItem } from "../../batch/reducer";
import type { Say } from "./scanFlow";
import ScanRow from "./ScanRow";

interface Props {
  items: BatchItem[];
  selected: string[];
  rootName: string;
  say: Say;
  onToggle: (relPath: string) => void;
  onAll: () => void;
  onNone: () => void;
}

export default function ScanList(props: Props) {
  const eligible = props.items.filter(isEligible).length;
  return (
    <section className="panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="panel-title !mb-0">Review — {props.items.length} images · {props.selected.length} selected</h3>
        <div className="flex gap-2">
          <button data-testid="batch-select-all" disabled={!eligible} onClick={props.onAll} className="btn-mini">Select all</button>
          <button data-testid="batch-deselect-all" disabled={!props.selected.length} onClick={props.onNone} className="btn-mini">Deselect all</button>
        </div>
      </div>
      {props.items.length ? (
        <div className="space-y-2">
          {props.items.map((item, i) => (
            <ScanRow key={item.relPath} item={item} index={i} rootName={props.rootName} picked={props.selected.includes(item.relPath)} say={props.say} onToggle={props.onToggle} />
          ))}
        </div>
      ) : (
        <p data-testid="batch-empty-note" className="rounded-xl border border-white/10 p-6 text-center text-slate-400">No images scanned yet. Pick a source folder to begin.</p>
      )}
    </section>
  );
}
