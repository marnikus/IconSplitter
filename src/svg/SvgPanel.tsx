// SvgPanel.tsx — the Generate SVG tab (prompt §1/§2/§17): controls, the honest
// discovery banners, the live batch strip, the bulk bar, the source list, the
// status footer, the three dialogs and the toast. The panel owns no rule of
// its own — discovery, sidecars, validation, versioning, the run, the lists
// and the review decision all live in tested modules; this file is the wiring
// that makes them one screen.

import { modelLabel } from "../lib/svgconfig";
import { costText } from "../lib/svgusage";
import type { DirHandleLike } from "../lib/fs";
import { useSvgGen, type SvgGenApi } from "./useSvgGen";
import SvgBulkBar from "./SvgBulkBar";
import SvgBatchStrip from "./SvgBatchStrip";
import SvgControls, { type SvgCounts } from "./SvgControls";
import SvgDialogs from "./SvgDialogs";
import { useSvgHotkeys } from "./SvgHotkeys";
import SvgList from "./SvgList";
import type { SvgRowActions } from "./SvgRow";

export default function SvgPanel() {
  const g = useSvgGen();
  const rootRef = g.refs.root as { current: DirHandleLike | null };
  useSvgHotkeys({
    visible: g.visible, activeId: g.activeId, dialogOpen: g.dialog !== null,
    setActive: g.setActive, toggleCheck: g.toggleCheck, generate: g.requestGenerate,
    decide: g.decide, showCode: g.showCode, dismissDialog: g.dismissDialog,
  });
  if (!g.supported) return <Unsupported onPick={g.chooseRoot} />;
  return (
    <div className="svg" data-testid="svg-panel">
      <Controls g={g} />
      <Banners g={g} />
      <Body g={g} rootRef={rootRef} />
      <SvgStatus g={g} />
      <SvgDialogs dialog={g.dialog} rows={g.rows} config={g.config} caps={g.caps} params={g.params}
        rootRef={rootRef} readCode={g.readCode}
        onConfirm={g.confirmGenerate} onDismiss={g.dismissDialog} onShowCode={g.showCode} />
      <Overlay g={g} />
    </div>
  );
}

/** The control block, wired straight from the api — one place to read it. */
function Controls({ g }: { g: SvgGenApi }) {
  return (
    <SvgControls rootName={g.rootName} discovery={g.discovery} busy={g.busy} counts={countsOf(g)}
      prompt={g.prompt} provider={g.provider} config={g.config} caps={g.caps} params={g.params}
      paramNote={g.paramNote} keySet={g.keySet} keyMask={g.keyMask} providerOpen={g.providerOpen}
      filter={g.filter} sort={g.sort} shown={g.visible.length} total={g.rows.length}
      onChooseRoot={g.chooseRoot} onRescan={g.rescan} onPrompt={g.setPrompt} onResetPrompt={g.resetPrompt}
      onConfig={g.setConfig} onParams={g.setParams} onRefreshModels={g.refreshModels}
      onDismissNote={() => g.dispatch({ type: "param-note", note: null })}
      onSaveKey={g.saveKey} onProviderOpen={g.setProviderOpen}
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
      {g.progress !== null && <SvgBatchStrip progress={g.progress} onCancel={g.cancelRun} />}
      <SvgBulkBar header={g.header} checkedCount={g.checked.length} visibleCount={g.visible.length}
        decidableCount={decidableCount(g)} thumb={g.thumb} bg={g.bg} model={modelLabel(g.config.model)} totals={g.totals}
        progress={g.progress} running={g.running}
        onToggleAll={(on) => (on ? g.selectVisible() : g.deselectAll())} onSelectVisible={g.selectVisible}
        onDeselectAll={g.deselectAll} onThumb={g.setThumb} onBg={g.setPreviewBg} onGenerate={() => g.requestGenerate(g.checked)}
        onDecide={(d) => g.decide(g.affected, d)} onCancel={g.cancelRun} />
      <SvgList g={g} actions={actions} />
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

/** The four counters above the list, straight off the rows (no extra state). */
function countsOf(g: SvgGenApi): SvgCounts {
  const rows = g.rows;
  return {
    eligible: rows.length,
    generated: rows.filter((r) => r.status === "generated").length,
    approved: rows.filter((r) => r.newest?.review === "approved").length,
    failed: rows.filter((r) => r.status === "failed").length,
  };
}

/** Selected rows that actually have a valid SVG to approve or decline. */
function decidableCount(g: SvgGenApi): number {
  return g.affected.filter((id) => g.rows.find((r) => r.source.id === id)?.newest != null).length;
}

/** What the scan could not use, said out loud instead of dropped silently. */
function Banners({ g }: { g: SvgGenApi }) {
  const d = g.discovery;
  const corrupt = g.rows.filter((r) => r.corrupt).length;
  const notes = [
    banner("decisions", d?.corruptDecisions === true,
      "review-decisions.json could not be read.",
      " The decisions held in memory are used for this session; no file was changed."),
    banner("missing", (d?.missing.length ?? 0) > 0,
      `${d?.missing.length ?? 0} approved pair(s) lost their AI image`,
      " since the last scan — they are not listed until the file is back."),
    banner("unreadable", (d?.unreadable.length ?? 0) > 0,
      `${d?.unreadable.length ?? 0} file(s) could not be read`, " and were skipped."),
    banner("sidecar", corrupt > 0,
      `${corrupt} sidecar(s) could not be parsed.`,
      " The SVG files on disk are untouched — regenerate to record a new version."),
  ].filter((n): n is Note => n !== null);
  return <>{notes.map((n) => <Banner key={n.id} note={n} />)}</>;
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
      <button type="button" className="svg-btn primary" onClick={onPick}>Choose source folder…</button>
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
