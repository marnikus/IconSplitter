// StockUploadBulkBar.tsx — pinned-to-top sticky menu: selection, zoom slider,
// multi-target stock checkboxes, same-stem format checkboxes, Apply badges & Upload.

import { BG_PRESETS, backgroundLabel, selectCustom, selectPreset, type PreviewBackground } from "../lib/svgbackground";
import StockPresetsPopup from "./StockPresetsPopup";
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, zoomLabel } from "../lib/zoom";
import UploadRowBadgeApply from "../upload/UploadRowBadgeApply";
import type { StockUploadApi } from "./useStockUpload";
import { parseUploadLimit } from "../lib/stockupload/uploadlimit";
import InvertButton from "../ui/InvertButton";
import RandomSelectControl from "../ui/RandomSelectControl";

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
      <InvertButton prefix="stock" onClick={g.invertVisible} />
      <RandomSelectControl prefix="stock" checkedCount={g.checked.length} totalCount={g.items.length} onSelect={g.selectRandom} />
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
      <RandomBatchesOption g={g} />
      <StockPresetsPopup g={g} />
      <LimitOption g={g} />
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

export function RandomBatchesOption({ g }: { g: StockUploadApi }) {
  // A limit always draws at random: the box shows that, and cannot be unticked then.
  const forced = g.model.prefs.uploadLimit > 0;
  return (
    <label className="svg-chip" style={{ cursor: "pointer" }}
      title="Every site takes 100 icons per batch: draw each batch at random from what is left, mix the files inside it, and send each under a shuffled number in front of its name (0001-icon-snowflake.jpg) so the site's own name sort cannot put similar icons side by side. Getty web sorts by that name; Shutterstock and Adobe Stock get the same number on a re-upload, so the file is replaced instead of duplicated">
      <input type="checkbox" data-testid="stock-random-batches"
        checked={g.model.prefs.randomBatches || forced} disabled={forced}
        onChange={(e) => g.setPrefs({ randomBatches: e.target.checked })} />
      <span>Random batches</span>
    </label>
  );
}

/**
 * "Limit" (2026-11-05): upload only this many icons this time, drawn at random
 * from the selection, in random batches of 100; the rest stay for a later run.
 * Empty / 0 = no limit.
 */
export function LimitOption({ g }: { g: StockUploadApi }) {
  const limit = g.model.prefs.uploadLimit;
  return (
    <label className="svg-chip" title="Upload only this many icons now, drawn at random from the selection, in random batches of 100 (Random batches is implied). The rest stay selected for a later run. Empty = no limit.">
      <span>Limit</span>
      <input type="number" min={0} step={1} className="svg-input" style={{ width: 72 }} data-testid="stock-upload-limit"
        placeholder="none" value={limit > 0 ? limit : ""}
        onChange={(e) => g.setPrefs({ uploadLimit: parseUploadLimit(e.target.value) })} />
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
      <button type="button" className="svg-btn" data-testid="stock-upload-history-open" onClick={g.openUploadHistory}
        title="Past upload batches per stock: review them and re-select their items">Upload history</button>
      <button type="button" className="svg-btn danger" data-testid="stock-remove-selected"
        disabled={g.checked.length === 0 || g.model.uploading} onClick={() => g.removeItems(g.checked)}
        title="Remove the checked items from this list: declines their sources in Generate SVG, so they also leave SVG to upload (Undo brings them back)">
        🗑 Remove selected
      </button>
      <button type="button" className="svg-btn primary" data-testid="stock-upload-start"
        disabled={g.checked.length === 0 || g.model.uploading} onClick={g.startUploadFlow}>
        ⇪ Upload ({g.checked.length})
      </button>
    </>
  );
}
