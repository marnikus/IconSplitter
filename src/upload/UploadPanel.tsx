// UploadPanel.tsx — the "SVG to upload" tab (design §1): controls, the honest
// discovery banners, the bulk bar, the icon list, the status footer, the two
// dialogs (settings + the exact-request metadata confirmation) and the toast.
// The panel owns no rule of its own — discovery, assembly, settings, the
// provider, both pipelines and the undo binding all live in tested modules;
// this file is the wiring that makes them one screen.

import type { CSSProperties } from "react";
import { generateContentUrl, PROVIDER_NAME } from "../lib/geminiclient";
import { DEFAULT_METADATA_PROMPT } from "../lib/uploadmeta";
import type { DirHandleLike } from "../lib/fs";
import { OpenFolderButton } from "../ui/FolderBar";
import { useUpload, type UploadApi } from "./useUpload";
import UploadBulkBar from "./UploadBulkBar";
import UploadControls from "./UploadControls";
import UploadList from "./UploadList";
import UploadSettingsDialog from "./UploadSettingsDialog";
import type { UploadRowActions } from "./UploadRow";
import type { UploadDiscovery, UploadExclusion } from "./discovery";

export default function UploadPanel() {
  const g = useUpload();
  const rootRef = g.refs.root as { current: DirHandleLike | null };
  if (!g.supported) return <Unsupported onPick={g.chooseRoot} />;
  return (
    <div className="svg up" data-testid="upload-panel" style={thumbStyle(g.thumb)}>
      <UploadControls rootName={g.rootName} discovery={g.discovery} busy={g.busy} counts={g.counts}
        gemini={g.gemini} keySet={g.keySet} keyMask={g.keyMask} providerOpen={g.providerOpen}
        filter={g.filter} sort={g.sort} shown={g.visible.length} total={g.rows.length}
        onChooseRoot={g.chooseRoot} onRescan={g.rescan} onSettings={() => g.openSettings(null)}
        onGemini={g.setGemini} onProviderOpen={g.setProviderOpen} onSaveKey={g.saveKey}
        onFilter={g.setFilter} onSort={g.setSort} onClearFilters={g.clearFilters} />
      <Banners g={g} />
      <Body g={g} rootRef={rootRef} />
      <StatusBar g={g} />
      <Dialogs g={g} />
      <Overlay g={g} />
    </div>
  );
}

/** Everything that only exists once a root is picked. */
function Body({ g, rootRef }: { g: UploadApi; rootRef: { current: DirHandleLike | null } }) {
  if (g.rootName === "") return <PickRoot onPick={g.chooseRoot} />;
  const actions: UploadRowActions = {
    activeId: g.activeId, checked: g.checked, thumb: g.thumb, bg: g.bg,
    rootToken: g.rootToken, rootRef,
    defaults: g.defaults, overrides: g.overrides,
    toggleCheck: g.toggleCheck, setActive: g.setActive, openSettings: g.openSettings,
    requestMetadata: g.requestMetadata, acceptMetadata: g.acceptMetadata,
    editMetadata: g.editMetadata, copyMeta: g.copyMeta, exportRow: g.exportRow,
  };
  return (
    <>
      <UploadBulkBar header={g.header} checkedCount={g.checked.length} visibleCount={g.visible.length}
        thumb={g.thumb} bg={g.bg} progress={g.progress}
        runningMeta={g.runningMeta} runningExport={g.runningExport}
        onToggleAll={(on) => (on ? g.selectVisible() : g.deselectAll())} onSelectVisible={g.selectVisible}
        onDeselectAll={g.deselectAll} onThumb={g.setThumb} onBg={g.setBg}
        onApplySettings={() => g.applyDefaultsToSelected(g.checked)}
        onMetadata={() => g.requestMetadata(g.checked)} onExport={() => g.exportRows(g.checked)}
        onCancel={() => (g.runningMeta > 0 ? g.cancelMetadata() : g.cancelExport())} />
      <UploadList g={g} actions={actions} />
    </>
  );
}

/** What the scan could not use — said out loud, and never by removing a row. */
function Banners({ g }: { g: UploadApi }) {
  const notes = bannerNotes(g);
  return (
    <>
      {notes.map((n) => (
        <p key={n.id} className="svg-warning" data-testid={`upload-warn-${n.id}`}>⚠ <strong>{n.strong}</strong>{n.rest}</p>
      ))}
    </>
  );
}

/** One banner per condition, each small enough to read on its own. */
function bannerNotes(g: UploadApi): Note[] {
  const d = g.discovery;
  const interrupted = g.rows.filter((r) => r.meta.state === "interrupted").length;
  return [
    excludedNote(d), corruptNote(d), unreadableNote(d), interruptedNote(interrupted),
  ].filter((n): n is Note => n !== null);
}

function excludedNote(d: UploadDiscovery | null): Note | null {
  const n = d?.excluded.length ?? 0;
  if (n === 0) return null;
  return {
    id: "excluded",
    strong: `${n} pair(s) are not listed`,
    rest: ` — ${exclusionSummary(d?.excluded ?? [])}. Approve an SVG in Generate SVG first. Nothing on disk was changed.`,
  };
}

function corruptNote(d: UploadDiscovery | null): Note | null {
  const n = d?.corruptFiles.length ?? 0;
  return n === 0 ? null : {
    id: "corrupt",
    strong: `${n} pair file(s) could not be parsed`,
    rest: " — their pairs are not listed; the SVG files on disk are untouched.",
  };
}

function unreadableNote(d: UploadDiscovery | null): Note | null {
  const n = d?.unreadable.length ?? 0;
  return n === 0 ? null : {
    id: "unreadable",
    strong: `${n} file(s) could not be read`,
    rest: " this scan (locked or still being written) — they are marked unreadable, never missing.",
  };
}

function interruptedNote(n: number): Note | null {
  return n === 0 ? null : {
    id: "interrupted",
    strong: `${n} metadata request(s) were in flight when the app closed`,
    rest: " — their outcome is unknown and they are never resent automatically; generate again to retry.",
  };
}

interface Note { id: string; strong: string; rest: string }

/** Why pairs are missing from the list, grouped by kind (banner summary). */
function exclusionSummary(excluded: readonly UploadExclusion[]): string {
  const kinds: [UploadExclusion["kind"], string][] = [
    ["no-approved-svg", "no approved SVG version"],
    ["no-valid-svg", "the approved SVG is missing or invalid"],
    ["no-sidecar", "no pair file"],
    ["outside-split", "outside the split output"],
    ["duplicate", "duplicate pair file"],
  ];
  return kinds.flatMap(([kind, label]) => {
    const n = excluded.filter((e) => e.kind === kind).length;
    return n === 0 ? [] : [`${n} ${label}`];
  }).join(", ");
}

/** One honest status line: the root, the counts, the provider, the key. */
function StatusBar({ g }: { g: UploadApi }) {
  return (
    <footer className="svg-statusbar" data-testid="upload-statusbar">
      <div className="svg-status-group">
        <span>{g.rootName === "" ? "No folder picked yet" : `Root ${g.rootName}`}</span>
        <span data-testid="upload-status-counts">
          {g.counts.processed} processed · {g.counts.partial} partial · {g.counts.failed} failed · {g.counts.stale} stale
        </span>
      </div>
      <div className="svg-status-group">
        <span data-testid="upload-status-provider">{PROVIDER_NAME} · {g.gemini.model}</span>
        <span>{g.keySet ? "key stored locally" : "no API key"}</span>
        {g.runningMeta > 0 && <span className="running" data-testid="upload-status-meta">metadata in flight</span>}
        {g.runningExport > 0 && <span className="running" data-testid="upload-status-export">export in flight</span>}
      </div>
    </footer>
  );
}

/** The settings dialog (global or one icon) and the metadata confirmation. */
function Dialogs({ g }: { g: UploadApi }) {
  return (
    <>
      <SettingsDialog g={g} />
      <MetaDialog g={g} />
    </>
  );
}

function SettingsDialog({ g }: { g: UploadApi }) {
  const dialog = g.dialog;
  if (dialog === null || dialog.kind !== "settings") return null;
  const id = dialog.id;
  const row = id === null ? null : g.rows.find((r) => r.source.id === id) ?? null;
  return (
    <UploadSettingsDialog
      scope={id === null ? null : row?.source.svgName ?? id}
      id={id}
      defaults={g.defaults}
      overrides={id === null ? {} : g.overrides[id] ?? {}}
      onDefaults={g.setDefaults}
      onOverride={g.setOverride}
      onResetOverride={g.resetOverride}
      onClose={g.dismissDialog} />
  );
}

/** The exact request, shown before any paid submission (design §2.4/§5). */
function MetaDialog({ g }: { g: UploadApi }) {
  const dialog = g.dialog;
  if (dialog === null || dialog.kind !== "meta") return null;
  const ids = dialog.ids;
  return (
    <div className="svg-backdrop" data-testid="upload-meta-backdrop" onClick={g.dismissDialog}>
      <section className="svg-modal" role="dialog" aria-modal="true" aria-labelledby="upload-meta-title"
        onClick={(e) => e.stopPropagation()}>
        <header className="svg-modal-head">
          <h2 id="upload-meta-title">Generate metadata for {ids.length} icon{ids.length === 1 ? "" : "s"}</h2>
          <button type="button" className="svg-btn tiny" data-testid="upload-meta-cancel" onClick={g.dismissDialog}>Cancel</button>
        </header>
        <div className="svg-modal-body">
          <p className="svg-note">
            Each icon's image is sent to Gemini inside this one request — nothing is uploaded
            automatically, and a timeout or disconnect is never resent on its own.
          </p>
          <MetaFacts g={g} />
          <p className="svg-note">The exact prompt (the validator enforces every rule it states):</p>
          <textarea className="svg-code" readOnly data-testid="upload-meta-prompt" aria-label="The exact metadata prompt"
            value={DEFAULT_METADATA_PROMPT} />
          <p className="svg-note">
            Request body: <code>{"{ contents: [{ role: \"user\", parts: [{ text: <the prompt> }, { inlineData: { mimeType: \"image/jpeg\", data: <base64 512 px preview> } }] }] }"}</code>
          </p>
          <DialogActions onDismiss={g.dismissDialog} onConfirm={g.confirmMetadata} />
        </div>
      </section>
    </div>
  );
}

/** Confirm sends; dismiss only closes — the request is never sent twice. */
function DialogActions({ onDismiss, onConfirm }: { onDismiss: () => void; onConfirm: () => void }) {
  return (
    <div className="up-dialog-actions">
      <button type="button" className="svg-btn" data-testid="upload-meta-dismiss" onClick={onDismiss}>Cancel</button>
      <button type="button" className="svg-btn primary" data-testid="upload-meta-confirm" onClick={onConfirm}>
        ✦ Generate metadata
      </button>
    </div>
  );
}

/** The four facts the confirmation states: provider, endpoint, auth, retries. */
function MetaFacts({ g }: { g: UploadApi }) {
  return (
    <div className="svg-facts">
      <div className="svg-fact"><span>Provider</span><strong data-testid="upload-meta-provider">{PROVIDER_NAME} · {g.gemini.model}</strong></div>
      <div className="svg-fact"><span>Endpoint</span><strong data-testid="upload-meta-endpoint">{generateContentUrl(g.gemini.baseUrl, g.gemini.model)}</strong></div>
      <div className="svg-fact"><span>Auth</span><strong>x-goog-api-key header — the key never enters a URL or a log</strong></div>
      <div className="svg-fact"><span>Retries</span><strong>{g.gemini.retries} · only provider-confirmed failures</strong></div>
    </div>
  );
}

/** The toast and the scan spinner, both announced politely. */
function Overlay({ g }: { g: UploadApi }) {
  return (
    <>
      {g.toast !== null && (
        <div className={`svg-toast${g.toast.err ? " error" : ""}`} role="status" aria-live="polite" data-testid="upload-toast">
          {g.toast.msg}
        </div>
      )}
      {g.busy !== null && <span className="svg-busy" data-testid="upload-busy">{g.busy}</span>}
    </>
  );
}

/** The ONE zoom value: the previews and the row height read it (I-55). */
function thumbStyle(px: number): CSSProperties {
  return { "--svg-thumb": `${px}px` } as CSSProperties;
}

function PickRoot({ onPick }: { onPick: () => void }) {
  return (
    <section className="svg-panel svg-center" data-testid="upload-root-empty">
      <p>Pick the folder that holds your pairs — every icon with an <strong>approved</strong> SVG is listed.</p>
      <OpenFolderButton testid="upload-open-folder-empty" onClick={onPick} />
    </section>
  );
}

function Unsupported({ onPick }: { onPick: () => void }) {
  return (
    <section className="svg-panel svg-center" data-testid="upload-unsupported">
      <p>Export preparation needs the File System Access API — Chrome or Edge.</p>
      <button type="button" className="svg-btn ghost" onClick={onPick}>Try anyway</button>
    </section>
  );
}

export type { UploadDiscovery };
