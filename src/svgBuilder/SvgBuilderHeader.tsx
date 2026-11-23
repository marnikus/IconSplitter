// SvgBuilderHeader.tsx — the reference header row: "COLLECTION / 01 · LIVE" +
// sheet title, then Undo / Redo (global timeline), SEED #### (re-roll),
// Prompt brief, Sheet metadata (AI, ours), a separate Export settings button
// (the upload flow's own popup, 2026-11-19) and the Export dropdown.
import { useOptionalHistoryView } from "../state/HistoryProvider";
import { sheetCopy } from "../lib/svgBuilder/compose";
import SvgBuilderExportMenu from "./SvgBuilderExportMenu";
import { IndexingControl, RegisterControl, StyleFilterControl } from "./SvgBuilderControls";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderHeader({ b }: { b: BuilderApi }) {
  const title = sheetCopy(b.metadata, b.config.banner).title.trim();
  return <header className="bld-header" data-testid="builder-header">
    <div className="bld-title-block">
      <span className="bld-eyebrow">COLLECTION / 01 · <i className="bld-live-dot" /> LIVE</span>
      <h2 data-testid="builder-sheet-title">{title === "" ? "Untitled icon sheet" : title}</h2>
    </div>
    <div className="bld-header-index" data-testid="builder-header-index"><IndexingControl b={b} /><StyleFilterControl b={b} /><RegisterControl b={b} /></div>
    <div className="bld-header-actions">
      <UndoRedo b={b} />
      <button type="button" className="svg-btn" data-testid="builder-seed" title="Re-roll this seed" disabled={b.assets.length === 0}
        onClick={b.actions.reshuffle}>↻ SEED <b>{b.seed}</b></button>
      <button type="button" className="svg-btn" data-testid="builder-open-preset-json" onClick={b.actions.openPresetJson}
        title="The whole sheet as editable JSON — edit, paste an AI-written preset, apply">{"{ }"} Preset JSON</button>
      <button type="button" className="svg-btn" data-testid="builder-brief" onClick={b.actions.openBrief}>▤ Prompt brief</button>
      <button type="button" className="svg-btn" data-testid="builder-open-metadata" onClick={b.actions.openMetadata}
        title="Show the metadata prompt and Gemini widget">✦ Sheet metadata</button>
      <button type="button" className="svg-btn" data-testid="builder-export-settings"
        title="What the next export writes: SVG / PNG / EPS, PNG size, expansion, rescale — the same popup the SVG to upload tab opens"
        onClick={b.actions.openExportFormats}>⚙ Export settings</button>
      <SvgBuilderExportMenu b={b} />
      <GenerateSelected b={b} />
      <ExportSelected b={b} />
    </div>
  </header>;
}

/** ✦ Generate metadata (2026-11-15): the checked artboards, else the open one, else the current sheet — the exact-request confirmation first. */
function GenerateSelected({ b }: { b: BuilderApi }) {
  const ids = b.artboardSel.checked.length > 0 ? b.artboardSel.checked : b.editingArtboardId !== null ? [b.editingArtboardId] : [];
  const run = () => (ids.length > 0 ? b.actions.generateArtboardsMetadata(ids) : b.actions.generateMetadata());
  return <button type="button" className="svg-btn" data-testid="builder-header-generate-metadata" disabled={b.busy !== null}
    title={ids.length > 0 ? "Generate metadata for the checked artboards (else the open one); the exact requests are shown first" : "Generate this sheet's metadata; the exact request is shown first"}
    onClick={run}>✦ Generate metadata{ids.length > 0 ? ` (${ids.length})` : ""}</button>;
}

/** Export all selected (2026-11-14): the checked artboards (else the open one) into `_artboard_sheets` in the folder. */
function ExportSelected({ b }: { b: BuilderApi }) {
  const count = b.artboardSel.checked.length > 0 ? b.artboardSel.checked.length : b.editingArtboardId !== null ? 1 : 0;
  return <button type="button" className="svg-btn primary" data-testid="builder-export-selected" disabled={count === 0 || b.root === null || b.busy !== null}
    title="Save each checked artboard (else the open one) as SVG + JPG + EPS + PNG + export.json under _artboard_sheets in the folder"
    onClick={b.actions.exportSelectedArtboards}>⇪ Export all selected{count > 0 ? ` (${count})` : ""}</button>;
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
