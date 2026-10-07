// UploadRow.tsx — one approved icon in the SVG-to-upload list (design §2/§5/§10).
// The row IS the SVG: its preview is the chosen version's file (never the AI
// image), its labels name the export base every format will share, and its
// problems are printed, not summarised away — a blocked row says what to fix and
// a warned row keeps the exact reasons the scan gave. Below the labels sits the
// metadata strip (§10): empty until a metadata run produced something, and
// always the place the editable, copyable fields will live.

import type { CSSProperties } from "react";
import { useEffect } from "react";
import { resolveBackground, type PreviewBackground } from "../lib/svgbackground";
import { buildSvgPreview } from "../lib/svgpreview";
import { zoomBoxRatio } from "../lib/zoom";
import SvgPreviewBox from "../svg/SvgPreview";
import type { UploadRow as Row } from "../lib/svgupload/rows";

export interface UploadRowProps {
  row: Row;
  zoom: number;
  background: PreviewBackground;
  checked: boolean;
  active: boolean;
  /** The chosen SVG's code, or null while it is still being read. */
  code: string | null;
  /** False when this icon overrides the global defaults. */
  inherited: boolean;
  onCheck: (id: string, on: boolean) => void;
  onActivate: (id: string) => void;
  onLoadCode: (relPath: string) => void;
  onResetRow: (id: string) => void;
}

export default function UploadRow(p: UploadRowProps) {
  const { row } = p;
  useEffect(() => {
    if (row.svgPath !== null) p.onLoadCode(row.svgPath);
  }, [row.svgPath, p]);
  const box = zoomBoxRatio(p.zoom, ratioOf(p.code));
  return (
    <div className={rowClass(p)} data-testid={`up-row-${row.id}`} data-active={p.active} onClick={() => p.onActivate(row.id)}>
      <input type="checkbox" data-testid={`up-check-${row.id}`} checked={p.checked} aria-label={`Select ${row.name}`}
        onChange={(e) => p.onCheck(row.id, e.target.checked)} onClick={(e) => e.stopPropagation()} />
      <Thumb row={row} code={p.code} box={box} background={p.background} />
      <Details p={p} />
    </div>
  );
}

function rowClass(p: UploadRowProps): string {
  return `svg-row up-row${p.active ? " active" : ""}${p.checked ? " selected" : ""}${p.row.blocked !== null ? " corrupt" : ""}`;
}

/** The preview: the chosen SVG, or the honest "No SVG" chip when there is none. */
function Thumb({ row, code, box, background }: {
  row: Row; code: string | null; box: { width: number; height: number }; background: PreviewBackground;
}) {
  return (
    <div className="up-thumb" style={frameStyle(background, box)}>
      {row.svgPath === null
        ? <span className="svg-thumb missing" style={{ width: box.width, height: box.height }} data-testid={`up-preview-${row.id}`}>No SVG</span>
        : <SvgPreviewBox code={code} box={box} testid={`up-preview-${row.id}`} label={`Preview of ${row.exportBase}`} version={row.version ?? 0} />}
    </div>
  );
}

/** Title, the version and settings chips, the folder, the metadata strip. */
function Details({ p }: { p: UploadRowProps }) {
  return (
    <div className="up-details">
      <div className="up-title">
        <strong>{p.row.exportBase}</strong>
        <span className="svg-chip" data-testid={`up-version-${p.row.id}`}><strong>{p.row.versionLabel}</strong></span>
        <span className={`svg-chip${p.inherited ? "" : " approved"}`} data-testid={`up-origin-${p.row.id}`}>
          {p.inherited ? "inherited settings" : "custom settings"}
        </span>
        <span className="svg-chip" data-testid={`up-state-${p.row.id}`}>{stateText(p.row)}</span>
        {!p.inherited && <ResetButton p={p} />}
      </div>
      <div className="svg-source">{p.row.dirPath}</div>
      <div className="up-meta" data-testid={`up-meta-${p.row.id}`}>{metaText(p.row)}</div>
      {p.row.warnings.length > 0 && <Warnings id={p.row.id} warnings={p.row.warnings} />}
    </div>
  );
}

function ResetButton({ p }: { p: UploadRowProps }) {
  return (
    <button className="svg-btn ghost" data-testid={`up-reset-row-${p.row.id}`}
      onClick={(e) => { e.stopPropagation(); p.onResetRow(p.row.id); }}>Reset</button>
  );
}

function Warnings({ id, warnings }: { id: string; warnings: string[] }) {
  return (
    <ul className="up-warn" data-testid={`up-warn-${id}`}>
      {warnings.map((w) => <li key={w}>{w}</li>)}
    </ul>
  );
}

/** The frame carries the background colour; the artwork is never recoloured. */
function frameStyle(bg: PreviewBackground, box: { width: number; height: number }): CSSProperties {
  return { background: resolveBackground(bg), width: box.width, height: box.height } as CSSProperties;
}

function ratioOf(code: string | null): number {
  return code === null ? 1 : buildSvgPreview(code).ratio || 1;
}

function metaText(row: Row): string {
  return row.blocked ?? "Metadata: not generated yet — title, description and 40 tags will appear here";
}

function stateText(row: Row): string {
  if (row.exportState === null) return "Not exported";
  return `${row.exportState.status} · ${row.exportState.at}`;
}
