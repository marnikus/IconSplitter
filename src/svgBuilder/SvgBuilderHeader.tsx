// SvgBuilderHeader.tsx — the reference header row: "COLLECTION / 01 · LIVE" +
// sheet title, then Undo / Redo (global timeline), SEED #### (re-roll),
// Prompt brief, Sheet metadata (AI, ours) and the Export dropdown.
import { useOptionalHistoryView } from "../state/HistoryProvider";
import { sheetCopy } from "../lib/svgBuilder/compose";
import SvgBuilderExportMenu from "./SvgBuilderExportMenu";
import { IndexingControl } from "./SvgBuilderControls";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderHeader({ b }: { b: BuilderApi }) {
  const title = sheetCopy(b.metadata, b.config.banner).title.trim();
  return <header className="bld-header" data-testid="builder-header">
    <div className="bld-title-block">
      <span className="bld-eyebrow">COLLECTION / 01 · <i className="bld-live-dot" /> LIVE</span>
      <h2 data-testid="builder-sheet-title">{title === "" ? "Untitled icon sheet" : title}</h2>
    </div>
    <div className="bld-header-index" data-testid="builder-header-index"><IndexingControl b={b} /></div>
    <div className="bld-header-actions">
      <UndoRedo b={b} />
      <button type="button" className="svg-btn" data-testid="builder-seed" title="Re-roll this seed" disabled={b.assets.length === 0}
        onClick={b.actions.reshuffle}>↻ SEED <b>{b.seed}</b></button>
      <button type="button" className="svg-btn" data-testid="builder-open-preset-json" onClick={b.actions.openPresetJson}
        title="The whole sheet as editable JSON — edit, paste an AI-written preset, apply">{"{ }"} Preset JSON</button>
      <button type="button" className="svg-btn" data-testid="builder-brief" onClick={b.actions.openBrief}>▤ Prompt brief</button>
      <button type="button" className="svg-btn" data-testid="builder-open-metadata" onClick={b.actions.openMetadata}
        title="Show the metadata prompt and Gemini widget">✦ Sheet metadata</button>
      <SvgBuilderExportMenu b={b} />
    </div>
  </header>;
}

function UndoRedo({ b }: { b: BuilderApi }) {
  const view = useOptionalHistoryView();
  return <div className="bld-undo" aria-label="Undo and redo">
    <button type="button" className="svg-btn tiny" data-testid="builder-undo" disabled={!view?.canUndo}
      title={view?.undoLabel ? `Undo: ${view.undoLabel}` : "Nothing to undo"} onClick={b.actions.undo}>↶</button>
    <button type="button" className="svg-btn tiny" data-testid="builder-redo" disabled={!view?.canRedo}
      title={view?.redoLabel ? `Redo: ${view.redoLabel}` : "Nothing to redo"} onClick={b.actions.redo}>↷</button>
  </div>;
}
