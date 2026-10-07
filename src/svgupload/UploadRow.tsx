// UploadRow.tsx — one approved icon in the SVG-to-upload list (design §2/§5/§10).
// The row IS the SVG: its preview is the chosen version's file (never the AI
// image), its labels name the export base every format will share, and its
// problems are printed, not summarised away — a blocked row says what to fix and
// a warned row keeps the exact reasons the scan gave. Under the labels sits the
// metadata strip, and beside them the six actions the request lists: Preview,
// Edit settings, Generate metadata, Export, Open export folder and Retry. The
// checkbox, the active row, the SVG approval and the export state stay three
// independent things: activating a row never selects it and selecting it never
// exports it.

import type { CSSProperties } from "react";
import { useEffect } from "react";
import { resolveBackground, type PreviewBackground } from "../lib/svgbackground";
import { buildSvgPreview } from "../lib/svgpreview";
import { zoomBoxRatio } from "../lib/zoom";
import SvgPreviewBox from "../svg/SvgPreview";
import { uploadRowState, type UploadRow as Row } from "../lib/svgupload/rows";
import { metaStateOf, type MetaState } from "../lib/svgupload/meta";
import type { MetaRecord } from "../lib/svgupload/metaprompt";
import UploadMetadata from "./UploadMetadata";

export interface UploadRowProps {
  row: Row;
  zoom: number;
  background: PreviewBackground;
  checked: boolean;
  active: boolean;
  /** The chosen SVG's code, or null while it is still being read. */
  code: string | null;
  /** The metadata record for this icon (accepted, draft or none). */
  meta: MetaRecord | null;
  /** True while a metadata request or an export for THIS icon is in flight. */
  busy: boolean;
  /** False when this icon overrides the global defaults. */
  inherited: boolean;
  onCheck: (id: string, on: boolean) => void;
  onActivate: (id: string) => void;
  onLoadCode: (relPath: string) => void;
  onResetRow: (id: string) => void;
  onAction: (action: RowAction, id: string) => void;
  onSaveMeta: (id: string, patch: { title: string; description: string; tags: string[] }) => void;
  onCopy: (text: string) => void;
}

export type RowAction = "preview" | "settings" | "generate" | "export" | "open" | "retry";

export const ROW_ACTIONS: readonly { id: RowAction; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "settings", label: "Edit settings" },
  { id: "generate", label: "Generate metadata" },
  { id: "export", label: "Export" },
  { id: "open", label: "Open export folder" },
  { id: "retry", label: "Retry" },
];

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

/** Title, the version and settings chips, the folder, the metadata, the actions. */
function Details({ p }: { p: UploadRowProps }) {
  return (
    <div className="up-details">
      <div className="up-title">
        <strong>{p.row.exportBase}</strong>
        <span className="svg-chip" data-testid={`up-version-${p.row.id}`}><strong>{p.row.versionLabel}</strong></span>
        <span className={`svg-chip${p.inherited ? "" : " approved"}`} data-testid={`up-origin-${p.row.id}`}>
          {p.inherited ? "inherited settings" : "custom settings"}
        </span>
        <StateChip p={p} />
        {!p.inherited && <ResetButton p={p} />}
      </div>
      <div className="svg-source">{p.row.dirPath}</div>
      <UploadMetadata id={p.row.id} state={metaStateOf(p.meta, p.row.fingerprint)} record={p.meta} busy={p.busy}
        onGenerate={(id) => p.onAction("generate", id)} onSave={p.onSaveMeta} onCopy={p.onCopy} />
      {p.row.warnings.length > 0 && <Warnings id={p.row.id} warnings={p.row.warnings} />}
      {p.row.exportState !== null && (
        <div className="up-export-note" data-testid={`up-export-note-${p.row.id}`}>{p.row.exportState.at} · {p.row.exportState.note}</div>
      )}
      <Actions p={p} />
    </div>
  );
}

/** The job state, in the words the counts use, plus the metadata state. */
function StateChip({ p }: { p: UploadRowProps }) {
  const state = uploadRowState(p.row);
  const meta = metaStateOf(p.meta, p.row.fingerprint);
  return (
    <>
      <span className={`svg-chip ${state.tone}`} data-testid={`up-state-${p.row.id}`}>{state.label}</span>
      {meta !== "none" && <span className="svg-chip" data-testid={`up-meta-state-${p.row.id}`}>{metaLabel(meta)}</span>}
    </>
  );
}

function metaLabel(state: MetaState): string {
  return { none: "no metadata", accepted: "metadata ok", stale: "metadata stale", rejected: "metadata needs review", interrupted: "metadata interrupted" }[state];
}

function ResetButton({ p }: { p: UploadRowProps }) {
  return (
    <button className="svg-btn ghost" data-testid={`up-reset-row-${p.row.id}`}
      onClick={(e) => { e.stopPropagation(); p.onResetRow(p.row.id); }}>Reset</button>
  );
}

/** The six row actions; a disabled one says why through its own title. */
function Actions({ p }: { p: UploadRowProps }) {
  return (
    <div className="up-actions" data-testid={`up-actions-${p.row.id}`}>
      {ROW_ACTIONS.map((action) => (
        <button key={action.id} className={`svg-btn${action.id === "export" ? "" : " ghost"}`}
          data-testid={`up-act-${action.id}-${p.row.id}`} disabled={p.busy || !enabled(p, action.id)}
          title={enabled(p, action.id) ? action.label : whyDisabled(p, action.id)}
          onClick={(e) => { e.stopPropagation(); p.onAction(action.id, p.row.id); }}>
          {action.label}
        </button>
      ))}
    </div>
  );
}

/** Which actions make sense for this row right now (§2/§16). */
export function enabled(p: UploadRowProps, action: RowAction): boolean {
  if (action === "preview") return p.row.svgPath !== null;
  if (action === "settings") return true;
  if (action === "generate") return p.row.blocked === null;
  if (action === "export" || action === "open") return p.row.blocked === null && p.row.metaState === "accepted";
  return p.row.job === "failed" || p.row.job === "interrupted" || p.row.job === "partial";
}

function whyDisabled(p: UploadRowProps, action: RowAction): string {
  if (p.row.blocked !== null) return p.row.blocked;
  if (action === "preview") return "No SVG to preview — choose a version in Generate SVG first.";
  if (action === "export" || action === "open") {
    if (p.meta === null) return "Generate the metadata first — the export embeds it.";
    return "The stored metadata is not accepted yet — fix it or regenerate before exporting.";
  }
  return "Nothing to retry: the last run finished.";
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
