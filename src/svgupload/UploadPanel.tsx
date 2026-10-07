// UploadPanel.tsx — the SVG-to-upload tab (design §2). Composition only: the
// state lives in useUpload, the settings form in UploadControls, the scope bar in
// UploadBulk and a row in UploadRow. The panel's job is the shape of the screen:
// the same folder control every tab shares (one picker, one path row, one
// Rescan), the settings, the list, the two dialogs and the honest notes —
// nothing here is uploaded anywhere, and every row's state is the state of a
// package in the picked folder, not a promise.

import type { CSSProperties } from "react";
import { OpenFolderButton, FolderPathRow } from "../ui/FolderBar";
import type { UploadRow as Row } from "../lib/svgupload/rows";
import type { SettingField } from "../lib/svgupload/settings";
import type { UploadApi } from "./useUpload";
import { useUpload } from "./useUpload";
import UploadBulk from "./UploadBulk";
import UploadControls from "./UploadControls";
import { PreviewDialog } from "./UploadDialogs";
import SettingsDialog from "./UploadSettingsDialog";
import UploadRow, { type RowAction } from "./UploadRow";

export default function UploadPanel() {
  const u = useUpload();
  if (typeof window !== "undefined" && pickerOf(window) === undefined) return <Unsupported />;
  return (
    <div className="svg" data-testid="up-panel" style={thumbStyle(u.zoom)}>
      <ScanBar u={u} />
      <UploadControls defaults={u.defaults} busy={u.busy !== null} onDefaults={u.changeDefaults} />
      {u.root !== null && <Bulk u={u} />}
      <Rows u={u} />
      <Dialogs u={u} />
      <Foot u={u} />
    </div>
  );
}

/** The shared folder control: pick, the read-only full path, and Rescan. */
function ScanBar({ u }: { u: UploadApi }) {
  return (
    <section className="svg-controls">
      <div className="svg-source">
        <OpenFolderButton onClick={u.chooseRoot} testid="up-open-folder" />
        <FolderPathRow rootName={u.root?.name ?? ""} testid="up-folder-path" />
        <button className="svg-btn" data-testid="up-rescan" disabled={u.root === null || u.busy !== null} onClick={u.rescan}>Rescan</button>
        <button className="svg-btn ghost" data-testid="up-provider" onClick={u.jobs.checkProvider}>Metadata model</button>
      </div>
    </section>
  );
}

function Bulk({ u }: { u: UploadApi }) {
  const scope = (): Row[] => u.rows.filter((r) => u.checked.includes(r.id) && r.blocked === null);
  const selected = scope().map((r) => r.id);
  return (
    <UploadBulk counts={u.counts} checkedCount={u.checked.length} view={u.view} zoom={u.zoom} background={u.background}
      busy={u.busy !== null} onView={u.setView} onZoom={u.setZoom} onBackground={u.setBackground}
      onToggleAll={u.toggleAll} onApply={u.applySelection} onReset={() => u.resetRows(u.checked)}
      jobs={{
        onGenerate: () => u.jobs.runMetadata(pick(selected, u.rows, "generate")),
        onExport: () => u.jobs.exportRows(pick(selected, u.rows, "export")),
        onRetry: u.jobs.retryFailed,
        onCancel: u.jobs.cancel,
        running: u.jobs.busyIds.length > 0,
        failed: u.counts.failed,
      }} />
  );
}

/** The selection, minus the icons the action cannot do anything with. */
function pick(ids: string[], rows: readonly Row[], action: "generate" | "export"): string[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.filter((id) => {
    const row = byId.get(id);
    if (row === undefined || row.blocked !== null) return false;
    return action === "generate" ? true : row.metaState === "accepted";
  });
}

function Rows({ u }: { u: UploadApi }) {
  if (u.root === null) {
    return <p className="up-note" data-testid="up-pick">Pick the folder you split the icons into — the approved SVGs are listed here.</p>;
  }
  return (
    <div className="svg-rows" data-testid="up-rows">
      {u.visible.map((row) => (
        <UploadRow key={row.id} row={row} zoom={u.zoom} background={u.background}
          checked={u.checked.includes(row.id)} active={row.id === u.activeId}
          code={row.svgPath === null ? null : u.codes[row.svgPath] ?? null}
          meta={u.jobs.meta[row.id] ?? null} busy={u.jobs.busyIds.includes(row.id)}
          inherited={u.inheritedFor(row.id)}
          onCheck={u.toggleCheck} onActivate={u.setActive} onLoadCode={u.loadCode}
          onResetRow={(id) => u.resetRows([id])} onAction={(action, id) => act(u, action, id)}
          onSaveMeta={u.jobs.saveMeta} onCopy={u.jobs.copyToClipboard} />
      ))}
    </div>
  );
}

/** What each row action does — the one place the six actions are dispatched. */
function act(u: UploadApi, action: RowAction, id: string): void {
  if (action === "preview") u.jobs.openDialog("preview", id);
  else if (action === "settings") u.jobs.openDialog("settings", id);
  else if (action === "generate") u.jobs.runMetadata([id]);
  else if (action === "export") u.jobs.exportRows([id]);
  else if (action === "open") u.jobs.openExport(id);
  else u.jobs.retryFailed();
}

/** The two dialogs, mounted only while open so nothing runs behind them. */
function Dialogs({ u }: { u: UploadApi }) {
  const row = u.dialogRow;
  if (u.dialog === null || row === null) return null;
  const code = row.svgPath === null ? null : u.codes[row.svgPath] ?? null;
  const meta = u.jobs.meta[row.id] ?? null;
  if (u.dialog.kind === "preview") {
    return <PreviewDialog row={row} code={code} background={u.background} zoom={u.zoom} jpegUrl={null} meta={meta}
      onZoom={u.setZoom} onBackground={u.setBackground} onClose={u.jobs.closeDialog} />;
  }
  const eff = u.effectiveOf(row.id);
  return <SettingsDialog row={row} values={eff.values} origin={eff.origin} canEps={eff.values.epsConverter !== ""}
    onChange={(field: SettingField, value: unknown) => u.patchRow(row.id, field, value)}
    onReset={() => u.resetRows([row.id])} onClose={u.jobs.closeDialog} />;
}

function Foot({ u }: { u: UploadApi }) {
  return (
    <>
      {u.busy !== null && <span className="svg-busy" data-testid="up-busy">{u.busy}</span>}
      {u.jobs.busyIds.length > 0 && <span className="svg-busy" data-testid="up-busy">{u.jobs.busyIds.length} icon(s) working…</span>}
      {(u.toast ?? u.jobs.note) !== null && (
        <div className="svg-toast" role="status" aria-live="polite" data-testid="up-toast">
          <button className="svg-btn ghost" onClick={u.toast !== null ? u.dismissToast : u.jobs.dismissNote} aria-label="Dismiss">×</button>
          {u.toast ?? u.jobs.note}
        </div>
      )}
      <p className="up-note">Exports stay inside the picked folder; nothing is uploaded anywhere.</p>
    </>
  );
}

function Unsupported() {
  return <p className="up-note" data-testid="up-unsupported">This tab needs a Chromium browser with folder access.</p>;
}

function pickerOf(win: Window): unknown {
  return (win as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
}

/** The ONE zoom value, published as the row height variable (I-55). */
function thumbStyle(px: number): CSSProperties {
  return { "--svg-thumb": `${px}px` } as CSSProperties;
}
