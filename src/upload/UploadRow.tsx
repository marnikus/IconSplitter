// UploadRow.tsx — one approved SVG per row (design §4.2): checkbox, the framed
// preview of the version that will be exported, file identity + the export
// folder, the package status, the metadata state, the effective settings, and
// the row's own Metadata / Settings / Export actions. The ACTIVE row expands
// to the editable metadata fields (UploadMetaFields) below it. Source approval,
// metadata readiness and package status are three independent flags — the
// badges never merge them.

import { paddingLabel } from "../lib/upload/padding";
import { memo } from "react";
import { useRowBinding, type RegisterCheckedRow } from "../ui/checkedrows";
import { selectIntent, type SelectIntent } from "../lib/reviewselect";
import { isRowGestureClick } from "../ui/rowgesture";
import type { IconMetadata } from "../lib/upload/meta";
import {
  megapixelTargetOf, overrideKeys, STROKE_COLOR_ARTWORK, type SettingsOverrides, type UploadSettings,
} from "../lib/upload/settings";
import { isAsIs } from "../lib/upload/asis";
import { rowSettings, type AppliedMap } from "../lib/upload/decorations";
import { exportDirOf } from "../lib/upload/export";
import type { PreviewBackground } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import { statusOf, type UploadCounts } from "./rowmodel";
import UploadPreview from "./UploadPreview";
import UploadMetaFields from "./UploadMetaFields";
import type { UploadJobStatus, UploadRow } from "./types";
import type { RowBadgeState } from "../lib/upload/rowbadge";
import UploadRowBadges from "./UploadRowBadges";

export interface UploadRowActions {
  activeId: string | null;
  checked: string[];
  thumb: number;
  bg: PreviewBackground;
  rootToken: number;
  rootRef: { current: DirHandleLike | null };
  defaults: UploadSettings;
  overrides: Record<string, SettingsOverrides>;
  /** Decorations a global control applied — they are not pins. */
  applied: AppliedMap;
  toggleCheck: (id: string) => void;
  selectRow: (id: string, intent: SelectIntent) => void;
  openSettings: (id: string | null) => void;
  openLocation: (id: string) => void;
  requestMetadata: (ids: string[]) => void;
  acceptMetadata: (id: string) => void;
  editMetadata: (id: string, patch: Partial<IconMetadata>) => void;
  copyMeta: (id: string, field: "title" | "description" | "tags") => void;
  exportRow: (id: string) => void;
  rowBadges: RowBadgeState;
  toggleRowBadge: (pairId: string, badgeId: string) => void;
}

export type UploadRowPresentation = Omit<UploadRowActions, "checked" | "activeId">;

/**
 * `active` is the ONLY active-dependent part (the expanded metadata fields), and
 * the list clones just that one row's element — so an arrow move re-renders one
 * row instead of all of them. Its class/aria-current/tabIndex still come from
 * the projection registry, never from this prop.
 */
function UploadRowView({ row, a, active = false, register }: { row: UploadRow; a: UploadRowPresentation; active?: boolean; register: RegisterCheckedRow }) {
  const ref = useRowBinding(row.source.id, register);
  const id = row.source.id;
  const status = statusOf(row);
  return (
    <div ref={ref} role="listitem" data-testid={`upload-row-${id}`} tabIndex={-1}
      className={`up-row ${status}`}
      onClick={(e) => { if (isRowGestureClick(e)) a.selectRow(id, selectIntent(e)); }}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); a.selectRow(id, "replace"); } }}>
      <input type="checkbox" className="up-check" data-testid={`upload-check-${id}`}
        aria-label={`Select ${row.source.svgName}`} onClick={(e) => e.stopPropagation()}
        onChange={() => a.toggleCheck(id)} />
      <RowContent row={row} a={a} />
      {active && <RowDetail id={id} row={row} a={a} />}
    </div>
  );
}

export default memo(UploadRowView);

const RowContent = memo(function RowContent({ row, a }: { row: UploadRow; a: UploadRowPresentation }) {
  const id = row.source.id;
  const status = statusOf(row);
  return <>
      <UploadPreview rootRef={a.rootRef} rootToken={a.rootToken} path={row.source.svgPath}
        thumb={a.thumb} bg={a.bg} testid={`upload-prev-${id}`}
        label={`${row.source.svgName} v${row.source.version}`} version={row.source.version}
        settings={rowSettings(a.defaults, id, a.overrides, a.applied)} />
      <FileCell row={row} a={a} />
      <StatusCell row={row} status={status} />
      <MetaCell row={row} />
      <SettingsCell row={row} a={a} />
      <ActionCell row={row} a={a} />
  </>;
});

/** The expandable detail: text only — the editable, copiable metadata fields. */
function RowDetail({ id, row, a }: { id: string; row: UploadRow; a: UploadRowPresentation }) {
  return (
    <div className="up-detail" data-testid={`upload-detail-${id}`}>
      <UploadMetaFields id={id} meta={row.meta}
        onEdit={(patch) => a.editMetadata(id, patch)}
        onAccept={() => a.acceptMetadata(id)}
        onCopy={(field) => a.copyMeta(id, field)}
        onRegenerate={() => a.requestMetadata([id])} />
    </div>
  );
}

function FileCell({ row, a }: { row: UploadRow; a: UploadRowPresentation }) {
  const id = row.source.id;
  return (
    <div className="svg-file-main">
      <div className="svg-file-name" title={row.source.svgName}>{row.source.svgName}</div>
      <div className="svg-file-sub" data-testid={`upload-target-${id}`} title={row.source.svgPath}>{row.source.svgPath}</div>
      <div className="svg-persist" data-testid={`upload-export-path-${id}`} title={`everything commits into ${exportDirOf(row.source.dirPath)}`}>
        export → {exportDirOf(row.source.dirPath)} · approved v{row.source.version}
        {row.source.approvedValid > 1 ? ` · ${row.source.approvedValid} approved versions` : ""}
      </div>
      <UploadRowBadges pairId={id} state={a.rowBadges} onToggle={a.toggleRowBadge} />
    </div>
  );
}

/** The package status badge, the stage while a run is in flight, the error, the auto-fix note. */
function StatusCell({ row, status }: { row: UploadRow; status: UploadJobStatus }) {
  const id = row.source.id;
  return (
    <div className="svg-cell" data-testid={`upload-status-${id}`}>
      <span className={`svg-badge ${badgeClass(status)}`}>{label(status)}</span>
      {row.running !== null && <span className="svg-progress-mini" aria-hidden="true"><span /></span>}
      {row.error !== "" && <small className="svg-error" title={row.error}>{row.error}</small>}
      {row.note !== "" && <small className="svg-note" title={row.note} data-testid={`upload-note-${id}`}>{row.note}</small>}
    </div>
  );
}

/** The metadata state badge and the last request's tokens. */
function MetaCell({ row }: { row: UploadRow }) {
  const id = row.source.id;
  const meta = row.meta;
  return (
    <div className="svg-cell" data-testid={`upload-meta-cell-${id}`}>
      <span className={`svg-badge ${meta.state}`}>{meta.state}</span>
      {meta.metadata !== null && <small>{meta.metadata.tags.length} tags</small>}
      {meta.usage.total !== null && <small>{meta.usage.total} tokens</small>}
    </div>
  );
}

/** "artwork strokes" | "2 px", then "· stroke #hex" when a colour is pinned. */
function strokeLine(s: UploadSettings): string {
  const width = s.strokePx === 0 ? "artwork strokes" : `${s.strokePx} px`;
  return s.strokeColor === STROKE_COLOR_ARTWORK ? width : `${width} · stroke ${s.strokeColor}`;
}

/** "eps on · inkscape", then "· strokes → fills" when the strokes are expanded (2026-10-09). */
function epsLine(s: UploadSettings): string {
  const eps = `svg ${s.includeSvg !== false ? "on" : "off"} · jpeg ${s.includeJpeg !== false ? "on" : "off"} · eps ${s.includeEps ? "on" : "off"} · ${s.epsConverter}`;
  return s.expandStrokes ? `${eps} · strokes → fills` : eps;
}

/** "· artboard 5 MP" while "Scale to N MP" really applies (content mode, box on — I-62). */
function artboardLine(s: UploadSettings): string {
  const mp = megapixelTargetOf(s.artboard, s.scaleToMegapixels, s.artboardMegapixels);
  return mp === null ? "" : ` · artboard ${mp} MP`;
}

function shadowLine(s: UploadSettings): string {
  return s.shadowEnabled ? ` · shadow ${s.shadowWidthPct}% · gap ${s.shadowGapPct}%` : "";
}

/**
 * The artboard decorations this row will ship — the list has to say that the
 * export adds something the artwork does not have (2026-10-20 review: a row
 * with a badge or a size guide looked identical to one without).
 */
function decorationLine(s: UploadSettings): string {
  const parts = [
    ...(s.badgeEnabled ? ["badge"] : []),
    ...(s.sizeGuideEnabled ? [`size guide ${s.sizeGuideSmallPct}/${s.sizeGuideLargePct}%`] : []),
  ];
  return parts.length === 0 ? "" : ` · ${parts.join(" · ")}`;
}

/** The effective settings, one line, plus how many fields this icon pins. */
function SettingsCell({ row, a }: { row: UploadRow; a: UploadRowPresentation }) {
  const id = row.source.id;
  const effective = rowSettings(a.defaults, id, a.overrides, a.applied);
  const pinned = overrideKeys(a.overrides[id] ?? {}).length;
  return (
    <div className="svg-cell" data-testid={`upload-settings-${id}`}>
      <small>{isAsIs(effective) ? "as is — the approved SVG, unchanged" : `pad ${paddingLabel(effective.paddingPct)} · ${effective.background} · ${strokeLine(effective)}`}</small>
      <small>{effective.jpegMegapixels} MP · q{effective.jpegQuality} · optimize {effective.optimizeSvg ? "on" : "off"} · {epsLine(effective)}{artboardLine(effective)}{shadowLine(effective)}{decorationLine(effective)}</small>
      <small className={pinned > 0 ? "up-overridden" : ""} data-testid={`upload-settings-pinned-${id}`}>
        {pinned === 0 ? "inherits defaults" : `${pinned} field${pinned === 1 ? "" : "s"} overridden`}
      </small>
    </div>
  );
}

/** Metadata / Settings / Export — the row's own three actions. */
function ActionCell({ row, a }: { row: UploadRow; a: UploadRowPresentation }) {
  const id = row.source.id;
  const click = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div className="svg-file-actions">
      <button type="button" className="svg-btn tiny" data-testid={`upload-meta-${id}`}
        onClick={click(() => a.requestMetadata([id]))}>Metadata</button>
      <button type="button" className="svg-btn tiny" data-testid={`upload-settings-btn-${id}`}
        onClick={click(() => a.openSettings(id))}>Settings</button>
      <button type="button" className="svg-btn tiny" data-testid={`upload-location-${id}`}
        title={row.record === null
          ? "Copy the export folder path — the folder is created at the first export"
          : "Copy the export folder path (the browser cannot open Explorer for you)"}
        onClick={click(() => a.openLocation(id))}>Location</button>
      <button type="button" className="svg-btn tiny primary" data-testid={`upload-export-${id}`}
        onClick={click(() => a.exportRow(id))}>Export</button>
    </div>
  );
}

/** "processed" → "Processed"; stage names pass through the same label rule. */
function label(value: string): string {
  return value.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** The badge colour class per status (the .up-* CSS carries the colours). */
function badgeClass(status: UploadJobStatus): string {
  if (status === "processed") return "processed";
  if (status === "partial" || status === "stale" || status === "interrupted") return "partial";
  if (status === "failed" || status === "cancelled") return "failed";
  if (status === "discovered") return "pending";
  return "generating";
}

export type { UploadCounts };
