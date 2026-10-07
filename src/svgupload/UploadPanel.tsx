// UploadPanel.tsx — the SVG-to-upload tab (design §2). Composition only: the
// state lives in useUpload, the settings form in UploadControls, the scope bar in
// UploadBulk and a row in UploadRow. The panel's job is the shape of the screen:
// the same folder control every tab shares (one picker, one path row, one
// Rescan), the settings, the list, and the two honest notes — nothing here is
// uploaded anywhere, and until the export pipeline lands a row says "not
// exported" instead of promising a file.

import type { CSSProperties } from "react";
import { OpenFolderButton, FolderPathRow } from "../ui/FolderBar";
import type { UploadApi } from "./useUpload";
import { useUpload } from "./useUpload";
import UploadBulk from "./UploadBulk";
import UploadControls from "./UploadControls";
import UploadRow from "./UploadRow";

export default function UploadPanel() {
  const u = useUpload();
  if (typeof window !== "undefined" && pickerOf(window) === undefined) return <Unsupported />;
  return (
    <div className="svg" data-testid="up-panel" style={thumbStyle(u.zoom)}>
      <ScanBar u={u} />
      <UploadControls defaults={u.defaults} busy={u.busy !== null} onDefaults={u.changeDefaults} />
      {u.root !== null && <Bulk u={u} />}
      <Rows u={u} />
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
      </div>
    </section>
  );
}

function Bulk({ u }: { u: UploadApi }) {
  return (
    <UploadBulk counts={u.counts} checkedCount={u.checked.length} view={u.view} zoom={u.zoom} background={u.background}
      busy={u.busy !== null} onView={u.setView} onZoom={u.setZoom} onBackground={u.setBackground}
      onToggleAll={u.toggleAll} onApply={u.applySelection} onReset={() => u.resetRows(u.checked)} />
  );
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
          inherited={u.inheritedFor(row.id)}
          onCheck={u.toggleCheck} onActivate={u.setActive} onLoadCode={u.loadCode}
          onResetRow={(id) => u.resetRows([id])} />
      ))}
    </div>
  );
}

function Foot({ u }: { u: UploadApi }) {
  return (
    <>
      {u.busy !== null && <span className="svg-busy" data-testid="up-busy">{u.busy}</span>}
      {u.toast !== null && (
        <div className="svg-toast" role="status" aria-live="polite" data-testid="up-toast">
          <button className="svg-btn ghost" onClick={u.dismissToast} aria-label="Dismiss">×</button>
          {u.toast}
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
