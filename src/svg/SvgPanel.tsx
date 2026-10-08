// SvgPanel.tsx — the Generate SVG tab (prompt §1/§2/§17): controls, the honest
// discovery banners, the live batch strip, the bulk bar, the source list, the
// status footer, the three dialogs and the toast. The panel owns no rule of
// its own — discovery, pair files, validation, versioning, the run, the lists
// and the review decision all live in tested modules; this file is the wiring
// that makes them one screen.

import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { setAppState } from "../state/appstore";
import SvgRunPopup from "./SvgRunPopup";
import { useTabActivation } from "./useActivation";
import { modelLabel } from "../lib/svgconfig";
import { costText } from "../lib/svgusage";
import type { DirHandleLike } from "../lib/fs";
import { OpenFolderButton } from "../ui/FolderBar";
import { useSvgGen, type SvgGenApi } from "./useSvgGen";
import SvgBulkBar from "./SvgBulkBar";
import RunRecord from "./RunRecord";
import SvgControls, { type SvgCounts } from "./SvgControls";
import SvgDialogs from "./SvgDialogs";
import { useSvgHotkeys } from "./SvgHotkeys";
import { shownVersion } from "./rowmodel";
import SvgList from "./SvgList";
import type { SvgRowActions } from "./SvgRow";
import type { Discovery, SourceProblem } from "./sources";
import { exclusionSummary } from "./sourcelist";

/** `active` is true while this tab is on screen; the panel stays mounted either way (D1). */
export default function SvgPanel({ active = true }: { active?: boolean }) {
  const g = useSvgGen();
  const rootRef = g.refs.root as { current: DirHandleLike | null };
  useTabActivation(active, g);
  useSvgHotkeys({
    active, visible: g.visible, activeId: g.activeId, dialogOpen: g.dialog !== null,
    setActive: g.setActive, toggleCheck: g.toggleCheck, generate: g.requestGenerate,
    decide: g.decide, showCode: g.showCode, dismissDialog: g.dismissDialog,
  });
  if (!g.supported) return <Unsupported onPick={g.chooseRoot} />;
  return (
    <div className="svg" data-testid="svg-panel" style={thumbStyle(g.thumb)}>
      <Controls g={g} />
      <Banners g={g} />
      <Body g={g} rootRef={rootRef} />
      <SvgStatus g={g} />
      <SvgDialogs dialog={g.dialog} rows={g.rows} config={g.config} caps={g.caps} params={g.params}
        rootRef={rootRef} readCode={g.readCode}
        onConfirm={g.confirmGenerate} onDismiss={g.dismissDialog} onShowCode={g.showCode}
        onUseVersion={g.preferVersion} running={g.running} />
      <Overlay g={g} />
      {createPortal(<SvgRunPopup progress={g.progress} queue={g.queue} running={g.running}
        onOpen={() => setAppState({ tab: "generateSvg" })} onCancel={g.cancelRun} />, document.body)}
    </div>
  );
}

/** The control block, wired straight from the api — one place to read it. */
function Controls({ g }: { g: SvgGenApi }) {
  return (
    <SvgControls rootName={g.rootName} discovery={g.discovery} busy={g.busy} counts={countsOf(g)}
      prompt={g.prompt} provider={g.provider} config={g.config} caps={g.caps} params={g.params}
      paramNote={g.paramNote} keySet={g.keySet} keyMask={g.keyMask} keySource={g.keySource} providerOpen={g.providerOpen}
      filter={g.filter} sort={g.sort} shown={g.visible.length} total={g.rows.length}
      onChooseRoot={g.chooseRoot} onRescan={g.rescan} onPrompt={g.setPrompt} onResetPrompt={g.resetPrompt}
      onConfig={g.setConfig} onParams={g.setParams} onRefreshModels={g.refreshModels}
      onDismissNote={() => g.dispatch({ type: "param-note", note: null })}
      onSaveKey={g.saveKey} onForgetKey={g.forgetKey} onProviderOpen={g.setProviderOpen}
      onFilter={g.setFilter} onSort={g.setSort}
      onClearFilters={() => g.setFilter({ generation: "all", review: "all", search: "" })} />
  );
}

/** Everything that only exists once a root is picked. */
function Body({ g, rootRef }: { g: SvgGenApi; rootRef: { current: DirHandleLike | null } }) {
  if (g.rootName === "") return <PickRoot onPick={g.chooseRoot} />;
  const actions: SvgRowActions = {
    activeId: g.activeId, checked: g.checked, thumb: g.thumb, rootToken: g.rootToken, bg: g.bg, rootRef,
    toggleCheck: g.toggleCheck, setActive: g.setActive, generate: g.requestGenerate,
    decide: g.decide, copyCode: g.copyCode, showCode: g.showCode, showHistory: g.showHistory,
    openLocation: g.openLocation,
  };
  return (
    <>
      <SvgBulkBar header={g.header} checkedCount={g.checked.length} requestCount={g.requests} visibleCount={g.visible.length}
        decidableCount={decidableCount(g)} thumb={g.thumb} bg={g.bg} model={modelLabel(g.config.model)} totals={g.totals}
        progress={g.progress} running={g.running}
        onToggleAll={(on) => (on ? g.selectVisible() : g.deselectAll())} onSelectVisible={g.selectVisible}
        onDeselectAll={g.deselectAll} onThumb={g.setThumb} onBg={g.setPreviewBg} onGenerate={() => g.requestGenerate(g.checked)}
        onDecide={(d) => g.decide(g.affected, d)} onCancel={g.cancelRun} />
      <SvgList g={g} actions={actions} />
      <RunRecord progress={g.progress} running={g.running} queue={g.queue} onCancel={g.cancelRun} onDrop={g.dropQueued} />
    </>
  );
}

/** The toast and the scan spinner, both announced politely. */
function Overlay({ g }: { g: SvgGenApi }) {
  return (
    <>
      {g.toast !== null && (
        <div className={`svg-toast${g.toast.err ? " error" : ""}`} role="status" aria-live="polite" data-testid="svg-toast">
          {g.toast.msg}
        </div>
      )}
      {g.busy !== null && <span className="svg-busy" data-testid="svg-busy">{g.busy}</span>}
    </>
  );
}

/** The ONE zoom value: both previews, the row height and the column read it. */
function thumbStyle(px: number): CSSProperties {
  return { "--svg-thumb": `${px}px` } as CSSProperties;
}

/** The four counters above the list, straight off the rows (no extra state). */
function countsOf(g: SvgGenApi): SvgCounts {
  const rows = g.rows;
  return {
    eligible: rows.length,
    generated: rows.filter((r) => r.status === "generated").length,
    approved: rows.filter((r) => shownVersion(r)?.review === "approved").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };
}

/** Selected rows that actually have a valid SVG to approve or decline. */
function decidableCount(g: SvgGenApi): number {
  return g.affected.filter((id) => { const r = g.rows.find((x) => x.source.id === id); return r !== undefined && shownVersion(r) !== null; }).length;
}

/** What the scan could not use — said out loud, and never by removing a row. */
function Banners({ g }: { g: SvgGenApi }) {
  const d = g.discovery;
  const corrupt = g.rows.filter((r) => r.corrupt).length;
  const notes = [
    banner("decisions", d?.corruptDecisions === true,
      "review-decisions.json could not be read.",
      " The decisions held in memory are used for this session; no file was changed."),
    problemNote(d),
    excludedNote(d),
    unreadableNote(d),
    banner("pairfile", corrupt > 0,
      `${corrupt} pair file(s) could not be parsed.`,
      " The SVG files on disk are untouched — regenerate to record a new version."),
  ].filter((n): n is Note => n !== null);
  return (
    <>
      <Inflight g={g} />
      {notes.map((n) => <Banner key={n.id} note={n} />)}
    </>
  );
}

/** Every approved pair that needs attention, with the first reasons spelled out. */
function problemNote(d: Discovery | null): Note | null {
  const problems = d?.problems ?? [];
  if (problems.length === 0) return null;
  return {
    id: "problems",
    strong: `${problems.length} listed source(s) need attention`,
    rest: ` — ${problemSummary(problems)}. They stay listed with their status.`,
  };
}

/**
 * Approved sources the list does NOT show, with why: a reference with no AI
 * image, a record with nothing on disk, a record that names no AI result, or a
 * duplicate path. Reported here, never dressed up as a generation row (I-31).
 */
function excludedNote(d: Discovery | null): Note | null {
  const excluded = d?.excluded ?? [];
  if (excluded.length === 0) return null;
  const shown = excluded.slice(0, 2).map((e) => e.reason);
  const more = excluded.length > shown.length ? ` (+${excluded.length - shown.length} more)` : "";
  return {
    id: "excluded",
    strong: `${excluded.length} approved source(s) are not listed`,
    rest: ` — ${exclusionSummary(excluded)}. ${shown.join("; ")}${more}. Nothing on disk was changed.`,
  };
}

/** Files that could not be read this scan — unreadable, never "missing". */
function unreadableNote(d: Discovery | null): Note | null {
  const files = d?.unreadable ?? [];
  if (files.length === 0) return null;
  return {
    id: "unreadable",
    strong: `${files.length} file(s) could not be read`,
    rest: " this scan (locked or still being written) — they are marked unreadable, never missing.",
  };
}

/** The reasons of the first few problems, so the banner names the actual files. */
function problemSummary(problems: SourceProblem[]): string {
  const shown = problems.slice(0, 3).map((p) => p.reason);
  const more = problems.length > shown.length ? ` (+${problems.length - shown.length} more)` : "";
  return `${shown.join("; ")}${more}`;
}

/**
 * What the previous session left without a confirmed outcome. It is a decision
 * for the user, never an automatic resend: retrying goes through the normal
 * confirmation, and dismissing only forgets the note.
 */
function Inflight({ g }: { g: SvgGenApi }) {
  const recovery = g.recovery;
  if (recovery.requests.length === 0) return null;
  return (
    <p className="svg-warning" data-testid="svg-inflight">
      ⚠ <strong data-testid="svg-inflight-note">{recovery.note}</strong>
      <button type="button" className="svg-btn tiny" data-testid="svg-inflight-retry" onClick={recovery.retry}>
        Retry these ({recovery.ids.length})
      </button>
      <button type="button" className="svg-btn tiny" data-testid="svg-inflight-dismiss" onClick={recovery.dismiss}>
        Dismiss
      </button>
    </p>
  );
}

interface Note { id: string; strong: string; rest: string }

function banner(id: string, on: boolean | undefined, strong: string, rest: string): Note | null {
  return on ? { id, strong, rest } : null;
}

function Banner({ note }: { note: Note }) {
  return (
    <p className="svg-warning" data-testid={`svg-warn-${note.id}`}>
      ⚠ <strong>{note.strong}</strong>{note.rest}
    </p>
  );
}

/** One honest status line: totals, provider and the run's progress. */
function SvgStatus({ g }: { g: SvgGenApi }) {
  const done = g.rows.filter((r) => r.status === "generated").length;
  return (
    <footer className="svg-statusbar" data-testid="svg-statusbar">
      <div className="svg-status-group">
        <span>{g.rootName === "" ? "No folder picked yet" : `Root ${g.rootName}`}</span>
        <span data-testid="svg-status-totals">visible usage {g.totals.tokens ?? "—"} tokens · {costText({ reported: g.totals.cost, estimated: g.totals.estimated })}</span>
        <span data-testid="svg-status-progress">{done} / {g.rows.length} generated</span>
      </div>
      <div className="svg-status-group">
        <span>{g.provider}</span>
        <span>{g.keySet ? "key stored locally" : "no API key"}</span>
        {g.running && <span className="running" data-testid="svg-status-running">generation in flight</span>}
      </div>
    </footer>
  );
}

function PickRoot({ onPick }: { onPick: () => void }) {
  return (
    <section className="svg-panel svg-center" data-testid="svg-root-empty">
      <p>Pick the folder that holds your originals, <code>_AI</code> results and <code>review-decisions.json</code>.</p>
      <OpenFolderButton testid="svg-open-folder-empty" onClick={onPick} />
    </section>
  );
}

function Unsupported({ onPick }: { onPick: () => void }) {
  return (
    <section className="svg-panel svg-center" data-testid="svg-unsupported">
      <p>SVG generation needs the File System Access API — Chrome or Edge.</p>
      <button type="button" className="svg-btn ghost" onClick={onPick}>Try anyway</button>
    </section>
  );
}
