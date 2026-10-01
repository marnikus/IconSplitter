// FolderPickers.tsx owns source/destination folder selection + rescan.

import type { FolderState } from "../../batch/reducer";

interface Props {
  folders: FolderState;
  busy: boolean;
  onSource: () => void;
  onDest: () => void;
  onRefresh: () => void;
  onDestMode: (v: boolean) => void;
}

export default function FolderPickers(props: Props) {
  const f = props.folders;
  return (
    <section className="panel">
      <h3 className="panel-title">Folders</h3>
      <button data-testid="batch-source-picker" disabled={props.busy} onClick={props.onSource} className="btn-ghost w-full">📁 Source folder</button>
      <p data-testid="batch-source-name" className="mt-1 truncate text-xs text-slate-400">{f.sourceName || "No source chosen"}</p>
      <button data-testid="batch-refresh" disabled={props.busy || !f.source} onClick={props.onRefresh} className="btn-ghost mt-3 w-full">↻ Rescan</button>
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
        <input data-testid="batch-custom-dest-toggle" type="checkbox" checked={f.useCustomDest} onChange={(e) => props.onDestMode(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
        Custom destination
      </label>
      {f.useCustomDest && (
        <div className="mt-2">
          <button data-testid="batch-dest-picker" disabled={props.busy} onClick={props.onDest} className="btn-ghost w-full">📁 Destination folder</button>
          <p data-testid="batch-dest-name" className="mt-1 truncate text-xs text-slate-400">{f.destName || "No destination chosen"}</p>
        </div>
      )}
      {!f.useCustomDest && <p data-testid="batch-dest-default" className="mt-2 text-xs text-slate-500">Output goes to {"<source>/_split_output"}</p>}
    </section>
  );
}
