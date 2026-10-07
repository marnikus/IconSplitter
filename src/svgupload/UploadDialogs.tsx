// UploadDialogs.tsx — the two row dialogs: Preview and Edit settings (design §2).
// Both are deliberately narrow:
//   · Preview shows the two things the package will contain — the export SVG (at
//     the frame's background, which is what the artwork sits on) and, when a
//     package exists, the exported JPEG beside it, so the user can compare the
//     vector with the raster that was made from it. The zoom here is DISPLAY
//     ONLY; the output size is stated separately, in numbers.
//   · Edit settings writes an OVERRIDE: every field shows whether it inherits the
//     global default or overrides it, and one button hands it back (Reset).
// Nothing in either dialog touches the source SVG, and neither one exports: an
// export is always an explicit action on the row or the bulk bar.

import type { ChangeEvent } from "react";
import { BG_PRESETS, resolveBackground, selectCustom, selectPreset, type PreviewBackground } from "../lib/svgbackground";
import type { UploadDefaults } from "../lib/svgupload/settings";
import { Modal } from "./UploadModal";
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from "../lib/zoom";
import { jpegTarget } from "../lib/svgupload/target";
import type { UploadRow } from "../lib/svgupload/rows";
import { boundsOfDocument } from "../lib/svgupload/prepare";
import type { MetaRecord } from "../lib/svgupload/metaprompt";

export interface PreviewDialogProps {
  row: UploadRow;
  code: string | null;
  background: PreviewBackground;
  zoom: number;
  /** The published JPEG, when a package exists (object URL, already loaded). */
  jpegUrl: string | null;
  meta: MetaRecord | null;
  onZoom: (px: number) => void;
  onBackground: (bg: PreviewBackground) => void;
  onClose: () => void;
}

/** What the target size will be, in numbers, from the plan's own maths. */
export function outputSize(code: string | null, defaults: UploadDefaults): { width: number; height: number; mp: number } {
  const bounds = code === null ? { x: 0, y: 0, w: 1, h: 1 } : boundsOfDocument(code);
  const ratio = bounds.w / bounds.h;
  const dims = jpegTarget(defaults.jpeg.targetMp, ratio);
  return { width: dims.width, height: dims.height, mp: dims.mp };
}

export function PreviewDialog(p: PreviewDialogProps) {
  const scale = { zoom: clampZoom(p.zoom) };
  return (
    <Modal title={`Preview — ${p.row.exportBase}`} testid="up-preview-dialog" onClose={p.onClose}>
      <div className="up-preview-grid">
        <figure className="up-preview-cell" data-testid="up-preview-svg">
          <div className="up-preview-frame" style={{ background: resolveBackground(p.background) }}>
            {p.code === null ? <span className="svg-thumb missing">No SVG</span> : <img alt="The export SVG" src={svgUrl(p.code)} width={scale.zoom} />}
          </div>
          <figcaption>The SVG that will be written ({p.row.svgPath ?? "none"})</figcaption>
        </figure>
        <figure className="up-preview-cell" data-testid="up-preview-jpeg">
          <div className="up-preview-frame" style={{ background: resolveBackground(p.background) }}>
            {p.jpegUrl === null
              ? <span className="svg-thumb missing" data-testid="up-preview-jpeg-missing">Not exported yet</span>
              : <img alt="The exported JPEG" src={p.jpegUrl} width={scale.zoom} />}
          </div>
          <figcaption>The JPEG rendered from it{metaLine(p.meta)}</figcaption>
        </figure>
      </div>
      <BackgroundRow background={p.background} onBackground={p.onBackground} />
      <label className="up-field">
        <span className="up-field-label">Display zoom <em className="up-count">{p.zoom} px — never the output size</em></span>
        <input type="range" data-testid="up-dialog-zoom" min={ZOOM_MIN} max={ZOOM_MAX} step={ZOOM_STEP} value={p.zoom}
          onChange={(e: ChangeEvent<HTMLInputElement>) => p.onZoom(Number(e.target.value))} />
      </label>
      <MetaSummary meta={p.meta} />
    </Modal>
  );
}

function metaLine(meta: MetaRecord | null): string {
  return meta === null ? "" : ` · metadata: ${meta.title}`;
}

/** The background choices, the same five presets as the toolbar plus custom. */
function BackgroundRow({ background, onBackground }: { background: PreviewBackground; onBackground: (bg: PreviewBackground) => void }) {
  return (
    <div className="up-bg-row" data-testid="up-dialog-bg">
      {BG_PRESETS.map((option) => (
        <button key={option.id} className={`svg-btn ghost${background.preset === option.id ? " active" : ""}`} data-testid={`up-dialog-bg-${option.id}`}
          onClick={() => onBackground(selectPreset(background, option.id))}>{option.label}</button>
      ))}
      <input type="color" data-testid="up-dialog-bg-custom" value={background.custom} aria-label="Custom background"
        onChange={(e) => onBackground(selectCustom(background, e.target.value))} />
    </div>
  );
}

function MetaSummary({ meta }: { meta: MetaRecord | null }) {
  if (meta === null) return <p className="up-note" data-testid="up-dialog-meta">No metadata yet — generate it before exporting.</p>;
  return (
    <div className="up-dialog-meta" data-testid="up-dialog-meta">
      <strong>{meta.title}</strong>
      <p>{meta.description}</p>
      <p className="up-tags">{meta.tags.join(", ")}</p>
      <p className="up-note">{meta.model} · {new Date(meta.at).toLocaleString()} · {meta.status}</p>
    </div>
  );
}

/** A data URL for the SVG text — the dialog never fetches anything. */
export function svgUrl(code: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`;
}
