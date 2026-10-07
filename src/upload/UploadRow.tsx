// UploadRow.tsx — one approved SVG per row (design §4.2): checkbox, the framed
// preview of the version that will be exported, file identity + the export
// folder, the package status, the metadata state, the effective settings, and
// the row's own Metadata / Settings / Export actions. The ACTIVE row expands
// to the editable metadata fields (UploadMetaFields) below it. Source approval,
// metadata readiness and package status are three independent flags — the
// badges never merge them.

import { useEffect, useRef } from "react";
import type { IconMetadata } from "../lib/upload/meta";
import { artboardSizeOf, effectiveSettings, overrideKeys, type SettingsOverrides, type UploadSettings } from "../lib/upload/settings";
import { exportDirOf } from "../lib/upload/export";
import type { PreviewBackground } from "../lib/svgbackground";
import type { DirHandleLike } from "../lib/fs";
import { statusOf, type UploadCounts } from "./rowmodel";
import UploadPreview from "./UploadPreview";
import UploadMetaFields from "./UploadMetaFields";
import type { UploadJobStatus, UploadRow } from "./types";

export interface UploadRowActions {
  activeId: string | null;
  checked: string[];
  thumb: number;
  bg: PreviewBackground;
  rootToken: number;
  rootRef: { current: DirHandleLike | null };
  defaults: UploadSettings;
  overrides: Record<string, SettingsOverrides>;
  toggleCheck: (id: string) => void;
  setActive: (id: string) => void;
  openSettings: (id: string | null) => void;
  openLocation: (id: string) => void;
  requestMetadata: (ids: string[]) => void;
  acceptMetadata: (id: string) => void;
  editMetadata: (id: string, patch: Partial<IconMetadata>) => void;
  copyMeta: (id: string, field: "title" | "description" | "tags") => void;
  exportRow: (id: string) => void;
}

export default function UploadRowView({ row, a }: { row: UploadRow; a: UploadRowActions }) {
  const active = row.source.id === a.activeId;
  const checked = a.checked.includes(row.source.id);
  const ref = useActiveScroll(active);
  const id = row.source.id;
  const status = statusOf(row);
  return (
    <div ref={ref} role="listitem" data-testid={`upload-row-${id}`} tabIndex={active ? 0 : -1}
      aria-current={active ? "true" : undefined}
      className={`up-row ${status}${active ? " active" : ""}${checked ? " selected" : ""}`}
      onClick={() => a.setActive(id)}>
      <input type="checkbox" className="up-check" data-testid={`upload-check-${id}`} checked={checked}
        aria-label={`Select ${row.source.svgName}`} onClick={(e) => e.stopPropagation()}
        onChange={() => a.toggleCheck(id)} />
      <UploadPreview rootRef={a.rootRef} rootToken={a.rootToken} path={row.source.svgPath}
        thumb={a.thumb} bg={a.bg} testid={`upload-prev-${id}`}
        label={`${row.source.svgName} v${row.source.version}`} version={row.source.version} />
      <FileCell row={row} />
      <StatusCell row={row} status={status} />
      <MetaCell row={row} />
      <SettingsCell row={row} a={a} />
      <ActionCell row={row} a={a} />
      {active && <RowDetail id={id} row={row} a={a} />}
    </div>
  );
}

/** The expandable detail: text only — the editable, copiable metadata fields. */
function RowDetail({ id, row, a }: { id: string; row: UploadRow; a: UploadRowActions }) {
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

/** Keeps the active row in view while the list scrolls. */
function useActiveScroll(active: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [active]);
  return ref;
}

/** The file a row is about and the folder its package commits into. */
function FileCell({ row }: { row: UploadRow }) {
  const id = row.source.id;
  return (
    <div className="svg-file-main">
      <div className="svg-file-name" title={row.source.svgName}>{row.source.svgName}</div>
      <div className="svg-file-sub" data-testid={`upload-target-${id}`} title={row.source.svgPath}>{row.source.svgPath}</div>
      <div className="svg-persist" data-testid={`upload-export-path-${id}`} title={`everything commits into ${exportDirOf(row.source.dirPath)}`}>
        export → {exportDirOf(row.source.dirPath)} · approved v{row.source.version}
        {row.source.approvedValid > 1 ? ` · ${row.source.approvedValid} approved versions` : ""}
      </div>
    </div>
  );
}

/** The package status badge, the stage while a run is in flight, the error. */
function StatusCell({ row, status }: { row: UploadRow; status: UploadJobStatus }) {
  const id = row.source.id;
  return (
    <div className="svg-cell" data-testid={`upload-status-${id}`}>
      <span className={`svg-badge ${badgeClass(status)}`}>{label(status)}</span>
      {row.running !== null && <span className="svg-progress-mini" aria-hidden="true"><span /></span>}
      {row.error !== "" && <small className="svg-error" title={row.error}>{row.error}</small>}
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

/** The effective settings, one line, plus how many fields this icon pins. */
function SettingsCell({ row, a }: { row: UploadRow; a: UploadRowActions }) {
  const id = row.source.id;
  const effective = effectiveSettings(a.defaults, a.overrides[id] ?? {});
  const pinned = overrideKeys(a.overrides[id] ?? {}).length;
  const art = artboardSizeOf(effective);
  return (
    <div className="svg-cell" data-testid={`upload-settings-${id}`}>
      <small>pad {effective.paddingPct}% · {effective.background} · {effective.strokePt === 0 ? "artwork strokes" : `${effective.strokePt} pt`}</small>
      <small>{effective.jpegMegapixels} MP · q{effective.jpegQuality} · optimize {effective.optimizeSvg ? "on" : "off"} · eps {effective.includeEps ? "on" : "off"} · {art.width}×{art.height}</small>
      <small className={pinned > 0 ? "up-overridden" : ""} data-testid={`upload-settings-pinned-${id}`}>
        {pinned === 0 ? "inherits defaults" : `${pinned} field${pinned === 1 ? "" : "s"} overridden`}
      </small>
    </div>
  );
}

/** Metadata / Settings / Export — the row's own three actions. */
function ActionCell({ row, a }: { row: UploadRow; a: UploadRowActions }) {
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
