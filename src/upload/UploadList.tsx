// UploadList.tsx — the icon list of the "SVG to upload" tab (design §4.2): head
// with the row count and the attention counters, the column header, the
// scrolling rows, and the footer line. The list holds no state of its own:
// filtering, sorting and the selection all come from the hook, so the rules
// stay in rowmodel (RULE 10).

import UploadRowView, { type UploadRowActions } from "./UploadRow";
import type { UploadApi } from "./useUpload";

export interface UploadListProps {
  g: UploadApi;
  actions: UploadRowActions;
}

export default function UploadList({ g, actions }: UploadListProps) {
  return (
    <div className="svg-panel" data-testid="upload-list">
      <ListHead g={g} />
      <div className="pair-table">
        <Columns />
        <div className="svg-rows" role="listbox" aria-label="Approved SVGs to export" data-testid="upload-rows">
          {g.visible.map((row) => <UploadRowView key={row.source.id} row={row} a={actions} />)}
          {g.visible.length === 0 && <p className="svg-empty" data-testid="upload-empty">No approved SVG matches these filters.</p>}
        </div>
      </div>
      <ListFooter g={g} />
    </div>
  );
}

/** The head: the visible count and the attention counters. */
function ListHead({ g }: { g: UploadApi }) {
  const running = g.rows.filter((r) => r.running !== null).length;
  const attention = g.rows.filter((r) => r.record?.status === "failed" || r.stale).length;
  return (
    <header className="svg-head">
      <div className="svg-title">
        <h1>APPROVED SVGS / EXPORT PACKAGES</h1>
        <span data-testid="upload-row-count">{g.visible.length}</span>
        <span>one package per pair</span>
      </div>
      <div className="svg-attention">
        <span className="running" data-testid="upload-running-count">{running} in flight</span>
        <span className="needs" data-testid="upload-attention-count">{attention} need attention</span>
      </div>
    </header>
  );
}

/** The column header — static text, so it cannot drift from the row layout. */
function Columns() {
  return (
    <div className="up-columns" aria-hidden="true">
      <span />
      <span>Approved SVG</span>
      <span>File / export folder</span>
      <span>Package</span>
      <span>Metadata</span>
      <span>Settings</span>
      <span>Actions</span>
    </div>
  );
}

/** What the list says under itself: how much is shown, and the one hint. */
function ListFooter({ g }: { g: UploadApi }) {
  return (
    <footer className="svg-list-footer">
      <span data-testid="upload-footer-summary">{`Showing ${g.visible.length} of ${g.rows.length} approved SVGs`}</span>
      <span className="svg-hints">click a row for its metadata fields · <kbd>Export</kbd> writes the package into the pair's export folder</span>
    </footer>
  );
}
