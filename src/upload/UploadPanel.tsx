// UploadPanel.tsx — the "SVG to upload" tab (design §1): controls, the honest
// discovery banners, the bulk bar, the icon list, the status footer, the two
// dialogs (settings + the exact-request metadata confirmation) and the toast.
// The panel owns no rule of its own — discovery, assembly, settings, the
// provider, both pipelines and the undo binding all live in tested modules;
// this file is the wiring that makes them one screen.

import type { KeySource } from "../lib/keyvault";
import type { CSSProperties } from "react";
import { PROVIDER_NAME } from "../lib/upload/gemini";
import type { DirHandleLike } from "../lib/fs";
import { OpenFolderButton } from "../ui/FolderBar";
import { useUpload, type UploadApi } from "./useUpload";
import { downloadPlanOf } from "./downloadactions";
import { idsNeedingMetadata } from "./rowmodel";
import UploadBulkBar from "./UploadBulkBar";
import UploadControls from "./UploadControls";
import UploadList from "./UploadList";
import UploadMetaDialog from "./UploadMetaDialog";
import UploadSettingsDialog from "./UploadSettingsDialog";
import type { UploadPromptPanelProps } from "./UploadPromptPanel";
import type { UploadRowActions } from "./UploadRow";
import type { UploadDiscovery, UploadExclusion } from "./discovery";

export default function UploadPanel() {
  const g = useUpload();
  const rootRef = g.refs.root as { current: DirHandleLike | null };
  if (!g.supported) return <Unsupported onPick={g.chooseRoot} />;
  return (
    <div className="svg up" data-testid="upload-panel" style={thumbStyle(g.thumb)}>
      <UploadControls rootName={g.rootName} discovery={g.discovery} busy={g.busy} counts={g.counts}
        gemini={g.gemini} modelCheck={g.modelCheck} keySet={g.keySet} keyMask={g.keyMask} keySource={g.keySource} providerOpen={g.providerOpen}
        filter={g.filter} sort={g.sort} shown={g.visible.length} total={g.rows.length}
        promptPanel={promptPanel(g)}
        onChooseRoot={g.chooseRoot} onRescan={g.rescan}
        onGemini={g.setGemini} onCheckModel={g.checkModel} onProviderOpen={g.setProviderOpen}
      onSaveKey={g.saveKey} onForgetKey={g.forgetKey}
        onFilter={g.setFilter} onSort={g.setSort} onClearFilters={g.clearFilters} />
      <Banners g={g} />
      <Body g={g} rootRef={rootRef} />
      <StatusBar g={g} />
      <Dialogs g={g} />
      <Overlay g={g} />
    </div>
  );
}

/** The prompt panel's props in one place, so the controls stay a screen of JSX. */
function promptPanel(g: UploadApi): UploadPromptPanelProps {
  return {
    prompt: g.prompt, presets: g.presets, picked: g.presetPick,
    onPrompt: g.setPrompt, onReset: g.resetPrompt, onPick: g.pickPreset,
    onQuickLoad: g.quickLoadPreset, onDelete: g.deletePreset, onSaveAs: g.savePresetAs,
  };
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
    openLocation: g.openLocation,
  };
  return (
    <>
      <UploadBulkBar header={g.header} checkedCount={g.checked.length} visibleCount={g.visible.length}
        thumb={g.thumb} bg={g.bg} progress={g.progress}
        runningMeta={g.runningMeta} runningExport={g.runningExport}
        metaNeeded={idsNeedingMetadata(g.rows, g.checked).length}
        downloadFiles={downloadPlanOf(g, g.checked).items.length}
        onToggleAll={(on) => (on ? g.selectVisible() : g.deselectAll())} onSelectVisible={g.selectVisible}
        onDeselectAll={g.deselectAll} onThumb={g.setThumb} onBg={g.setBg}
        onSettings={() => g.openSettings(null)}
        onApplySettings={() => g.applyDefaultsToSelected(g.checked)}
        onMetadata={() => g.generateMetadataSelected(g.checked)} onExport={() => g.exportSelected(g.checked)}
        onDownload={() => g.downloadSelected(g.checked)}
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
  const interrupted = g.rows.filter((r) => r.meta.state === "interrupted" || r.status === "interrupted").length;
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
    strong: `${n} icon(s) did not finish before the app closed`,
    rest: " — their outcome is unknown and they are never resent automatically; generate or export again to retry.",
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
        <span>{keyLine(g.keySet, g.keySource)}</span>
        {g.runningMeta > 0 && <span className="running" data-testid="upload-status-meta">metadata in flight</span>}
        {g.runningExport > 0 && <span className="running" data-testid="upload-status-export">export in flight</span>}
      </div>
    </footer>
  );
}

/** The settings dialog (global or one icon) and the metadata confirmation. */
function Dialogs({ g }: { g: UploadApi }) {
  const dialog = g.dialog;
  return (
    <>
      <SettingsDialog g={g} />
      {dialog !== null && dialog.kind === "meta" && <UploadMetaDialog g={g} dialog={dialog} />}
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

/** The status bar's one word about the key — never "no key" when unreadable. */
function keyLine(keySet: boolean, source: KeySource): string {
  if (!keySet) return source === "unreadable" ? "key storage unreadable" : "no API key";
  return source === "session" ? "key for this session only" : "key stored locally";
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
