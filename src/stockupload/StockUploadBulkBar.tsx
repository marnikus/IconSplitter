// StockUploadBulkBar.tsx — pinned-to-top sticky menu: selection, zoom slider,
// multi-target stock checkboxes, same-stem format checkboxes, Apply badges & Upload.

import { BG_PRESETS, backgroundLabel, selectCustom, selectPreset, type PreviewBackground } from "../lib/svgbackground";
import type { UploadFormatKey } from "../lib/stockupload/types";
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomLabel } from "../lib/zoom";
import UploadRowBadgeApply from "../upload/UploadRowBadgeApply";
import type { StockUploadApi } from "./useStockUpload";

const FORMAT_LABELS: { key: UploadFormatKey; label: string }[] = [
  { key: "raster", label: "JPEG/PNG" },
  { key: "svg", label: "SVG" },
  { key: "eps", label: "EPS" },
  { key: "zip", label: "ZIP" },
];

export default function StockUploadBulkBar({ g }: { g: StockUploadApi }) {
  return (
    <div className="svg-bulkbar-pin" data-testid="stock-bulkbar-pin">
      <div className="svg-bulk" data-testid="stock-bulk">
        <SelectionCluster g={g} />
        <ActionCluster g={g} />
      </div>
    </div>
  );
}

function SelectionCluster({ g }: { g: StockUploadApi }) {
  return (
    <div className="svg-bulk-left">
      <input type="checkbox" data-testid="stock-check-all" aria-label="Select all visible exported items"
        checked={g.header === "all"} onChange={(e) => (e.target.checked ? g.selectVisible() : g.uncheckVisible())}
        ref={(el) => { if (el) el.indeterminate = g.header === "some"; }} />
      <span className="svg-selected-copy" data-testid="stock-selected-count">{g.checked.length} selected</span>
      <span className="svg-scope-copy" data-testid="stock-scope">across {g.visible.length} exported</span>
      <span className="svg-divider" aria-hidden="true" />
      <button type="button" className="svg-btn" data-testid="stock-select-visible" onClick={g.selectVisible}>
        Select all visible
      </button>
      <button type="button" className="svg-btn" data-testid="stock-deselect" onClick={g.deselectAll}>
        Deselect all
      </button>
    </div>
  );
}

function ActionCluster({ g }: { g: StockUploadApi }) {
  return (
    <div className="svg-bulk-right" data-testid="stock-bulk-right">
      <PreviewBgControl bg={g.model.prefs.bg} onBg={(bg) => g.setPrefs({ bg })} />
      <span className="svg-divider" aria-hidden="true" />
      <ZoomControl thumb={g.model.prefs.thumb} onThumb={(thumb) => g.setPrefs({ thumb: clampZoom(thumb) })} />
      <span className="svg-divider" aria-hidden="true" />
      <UploadRowBadgeApply state={g.rowBadges} ids={g.checked} onApply={g.applyRowBadgeSelected} />
      <span className="svg-divider" aria-hidden="true" />
      <FormatCheckboxes g={g} />
      <CombinedTitleOption g={g} />
      <RandomBatchesOption g={g} />
      <span className="svg-divider" aria-hidden="true" />
      <TargetSiteCheckboxes g={g} />
      <UploadButtons g={g} />
    </div>
  );
}

function PreviewBgControl({ bg, onBg }: { bg: PreviewBackground; onBg: (b: PreviewBackground) => void }) {
  return (
    <div className="svg-bg-presets" role="group" aria-label={`Preview background (${backgroundLabel(bg)})`}>
      {BG_PRESETS.map((p) => (
        <button key={p.id} type="button" className={`svg-bg-swatch${bg.preset === p.id ? " active" : ""}`}
          data-testid={`stock-bg-${p.id}`} title={p.label} style={{ background: p.color }}
          onClick={() => onBg(selectPreset(bg, p.id))} />
      ))}
      <input type="color" aria-label="Custom preview background" value={bg.custom}
        onChange={(e) => onBg(selectCustom(bg, e.target.value))} />
    </div>
  );
}

function ZoomControl({ thumb, onThumb }: { thumb: number; onThumb: (px: number) => void }) {
  return (
    <label className="svg-zoom">
      <span>Zoom</span>
      <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP}
        data-testid="stock-upload-zoom" aria-label="Thumbnail zoom" value={thumb}
        onChange={(e) => onThumb(Number(e.target.value))} />
      <span data-testid="stock-zoom-label">{zoomLabel(thumb)}</span>
    </label>
  );
}

function FormatCheckboxes({ g }: { g: StockUploadApi }) {
  return (
    <div className="svg-toolbar" role="group" aria-label="File formats to upload" style={{ gap: 6 }}>
      {FORMAT_LABELS.map(({ key, label }) => (
        <label key={key} className="svg-chip" style={{ cursor: "pointer" }}>
          <input type="checkbox" data-testid={`stock-format-${key}`}
            checked={g.presetState.formats[key]}
            onChange={(e) => g.setFormat(key, e.target.checked)} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function CombinedTitleOption({ g }: { g: StockUploadApi }) {
  return (
    <label className="svg-chip" title="Changes only upload copies, not your original files" style={{ cursor: "pointer" }}>
      <input type="checkbox" data-testid="stock-combine-title-description"
        checked={g.model.prefs.combineTitleDescription}
        onChange={(e) => g.setPrefs({ combineTitleDescription: e.target.checked })} />
      <span>Title + description</span>
    </label>
  );
}

function RandomBatchesOption({ g }: { g: StockUploadApi }) {
  return (
    <label className="svg-chip" style={{ cursor: "pointer" }}
      title="Getty web takes 100 icons per batch: draw each batch at random from the remaining icons instead of taking them in list order">
      <input type="checkbox" data-testid="stock-random-batches"
        checked={g.model.prefs.randomBatches}
        onChange={(e) => g.setPrefs({ randomBatches: e.target.checked })} />
      <span>Random batches</span>
    </label>
  );
}

function TargetSiteCheckboxes({ g }: { g: StockUploadApi }) {
  const checkedSet = new Set(g.presetState.checkedTargets);
  return (
    <div className="svg-toolbar" role="group" aria-label="Target FTP stock websites" style={{ gap: 6 }}>
      {g.presetState.presets.map((pr) => (
        <label key={pr.id} className="svg-chip" style={{ cursor: "pointer" }}
          title={`${pr.host || "unconfigured"}:${pr.port}`}>
          <input type="checkbox" data-testid={`stock-target-check-${pr.id}`}
            checked={checkedSet.has(pr.id)} onChange={() => g.toggleTarget(pr.id)} />
          <span>{pr.name}</span>
        </label>
      ))}
    </div>
  );
}

function UploadButtons({ g }: { g: StockUploadApi }) {
  return (
    <>
      {g.model.uploading && (
        <button type="button" className="svg-btn" data-testid="stock-upload-cancel" onClick={g.cancelUpload}>
          Cancel upload
        </button>
      )}
      <button type="button" className="svg-btn primary" data-testid="stock-upload-start"
        disabled={g.checked.length === 0 || g.model.uploading} onClick={g.startUploadFlow}>
        ⇪ Upload ({g.checked.length})
      </button>
    </>
  );
}
