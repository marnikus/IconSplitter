import SvgStyleBar from "./SvgStyleBar";
import SvgRuns from "./SvgRuns";
// SvgPanel.tsx — the Generate SVG tab (prompt §1/§2/§17): controls, the honest
// discovery banners, the bulk bar, the source list, the run record (strip and
// queue, below the list), the status footer, the three dialogs and the toast. The panel owns no rule of
// its own — discovery, pair files, validation, versioning, the run, the lists
// and the review decision all live in tested modules; this file is the wiring
// that makes them one screen.

import { memo, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { modelLabel } from "../lib/svgconfig";
import { costText } from "../lib/svgusage";
import type { DirHandleLike } from "../lib/fs";
import { OpenFolderButton } from "../ui/FolderBar";
import { useSvgGen, type SvgGenApi } from "./useSvgGen";
import { PanelDialogs, panelRowActions, usePanelBulkCallbacks, usePanelControlProps } from "./panelbits";
import SvgBulkBar from "./SvgBulkBar";
import { svgDataRows } from "./getdatarows";
import RunRecord from "./RunRecord";
import SvgImgReview from "./SvgImgReview";
import SvgImgInflight from "./SvgImgInflight";
import SvgJobProgress from "./SvgJobProgress";
import SvgControls from "./SvgControls";
import { useSvgHotkeys } from "./SvgHotkeys";
import { useSelectShortcuts } from "../lib/selectshortcuts";
import { useRunning } from "../ui/rebuildwatch";
import { countInSet, indexSvgRows, type SvgCounts, type SvgRowIndex } from "./panelcounts";
import SvgList from "./SvgList";
import type { Discovery, SourceProblem } from "./sources";
import { exclusionSummary } from "./sourcelist";
import { useBusyActivity } from "../ui/useBusyActivity";
import SvgEditModal from "./pathedit/SvgEditModal";

/**
 * `active` (2026-10-08): the Workbench keeps this panel mounted on every tab
 * and parks it hidden, so a run in flight is never unmounted. Coming back to
 * the tab refreshes the pinned list order (and rescans when nothing runs) —
 * the one moment a reorder is deliberate, not a jump under the user's eyes.
 */
function usePanelEffects(active: boolean, g: SvgGenApi): void {
  const dialogOpen = g.dialog !== null || g.imgReview !== null;
  useBusyActivity("svg", g.busy, (busy) => busy.startsWith("Regenerating AI sources"));
  useRunning("svg", g.running);
  useSelectShortcuts({ activeId: g.activeId, selectActive: g.checkActive, deselectActive: g.uncheckActive, selectVisible: g.selectVisible, deselectAll: g.deselectAll }, active && !dialogOpen);
  useSvgHotkeys({
    visible: g.visible, activeId: g.activeId, dialogOpen,
    setActive: g.setActive, toggleCheck: g.toggleCheck, generate: g.requestGenerate,
    decide: g.decide, showCode: g.showCode, dismissDialog: g.dismissDialog,
  }, active);
  useActivation(active, g);
}

export default function SvgPanel({ active = true }: { active?: boolean }) {
  const g = useSvgGen();
  const rowIndex = useMemo(() => indexSvgRows(g.rows), [g.rows]);
  const rootRef = g.refs.root as { current: DirHandleLike | null };
  usePanelEffects(active, g);
  if (!g.supported) return <Unsupported onPick={g.chooseRoot} />;
  return (
    <div className="svg" data-testid="svg-panel" style={thumbStyle(g.thumb)}>
      <SvgJobProgress g={g} rootRef={rootRef} />
      <Controls g={g} root={rootRef.current} counts={rowIndex.counts} />
      <Banners g={g} corrupt={rowIndex.corrupt} />
      <Body g={g} rootRef={rootRef} rowIndex={rowIndex} />
      <SvgStatus rootName={g.rootName} totals={g.totals} done={rowIndex.counts.generated}
        total={g.rows.length} provider={g.provider} keySet={g.keySet} running={g.running} />
      <PanelDialogs g={g} rootRef={rootRef} />
      {g.imgReview && <SvgImgReview review={g.imgReview} onApply={g.applyImageReview} onDiscard={g.discardImageReview} />}
      <Overlay g={g} />
      <SvgEditModal rows={g.visible} rootRef={rootRef} rootToken={g.rootToken} />
    </div>
  );
}

/** On every return to the tab (not the first mount, which scans anyway): repin, and rescan when idle. */
function useActivation(active: boolean, g: SvgGenApi): void {
  const was = useRef(active);
  const latest = useRef(g);
  latest.current = g;
  useEffect(() => {
    const back = active && !was.current;
    was.current = active;
    if (!back) return;
    const api = latest.current;
    api.dispatch({ type: "repin" });
    if (!api.running && api.rootName !== "") api.rescan();
  }, [active]);
}

/** The control block, wired straight from the api — one place to read it. */
function Controls({ g, root, counts }: { g: SvgGenApi; root: DirHandleLike | null; counts: SvgCounts }) {
  const { prompt, cbs } = usePanelControlProps(g);
  return (
    <SvgControls rootName={g.rootName} root={root} discovery={g.discovery} busy={g.busy} counts={counts}
      prompt={prompt} provider={g.provider} config={g.config} caps={g.caps} params={g.params}
      connections={g.connections} activeConn={g.activeConn}
      paramNote={g.paramNote} keySet={g.keySet} keyMask={g.keyMask} keySource={g.keySource} providerOpen={g.providerOpen}
      filter={g.filter} sort={g.sort} sortDir={g.sortDir} shown={g.visible.length} total={g.rows.length}
      {...cbs} />
  );
}

/** Everything that only exists once a root is picked. */
function Body({ g, rootRef, rowIndex }: { g: SvgGenApi; rootRef: { current: DirHandleLike | null }; rowIndex: SvgRowIndex }) {
  const decidable = useMemo(() => countInSet(g.affected, rowIndex.decidableIds), [g.affected, rowIndex]);
  const declinable = useMemo(() => countInSet(g.affected, rowIndex.knownIds), [g.affected, rowIndex]);
  const regenerable = useMemo(() => countInSet(g.checked, rowIndex.generatedIds), [g.checked, rowIndex]);
  const cbs = usePanelBulkCallbacks(g, () => svgDataRows(g.rows, g.checked));
  const styles = useMemo(
    () => <SvgStyleBar checked={g.checked.length} onRegister={cbs.onRegisterStyle} onStyle={cbs.onStyle} />,
    [g.checked.length, cbs.onRegisterStyle, cbs.onStyle],
  );
  if (g.rootName === "") return <PickRoot onPick={g.chooseRoot} />;
  return (
    <>
      <div className="svg-bulkbar-pin" data-testid="svg-bulkbar-pin">
        <SvgBulkBar header={g.header} checkedCount={g.checked.length} regenerableCount={regenerable}
          requestCount={g.requests} visibleCount={g.visible.length} decidableCount={decidable} declinableCount={declinable}
          thumb={g.thumb} bg={g.bg} stroke={g.stroke} model={modelLabel(g.config.model)} totals={g.totals}
          progress={g.progress} running={g.running} imageActive={g.busy?.startsWith("Regenerating AI sources") ?? false}
          imageRunning={g.imgRunning.length + (g.imgReview?.cells.length ?? 0)}
          checkedIds={g.checked} styles={styles} {...cbs} />
      </div>
      <SvgList g={g} rowIndex={rowIndex} actions={panelRowActions(g, rootRef)} />
      <SvgRuns refs={g.refs} onStop={g.cancelRun} />
      <RunRecord progress={g.progress} running={g.running} queue={g.queue} onCancel={g.skipCurrentRequest} onDrop={g.dropQueued} />
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

/** What the scan could not use — said out loud, and never by removing a row. */
function Banners({ g, corrupt }: { g: SvgGenApi; corrupt: number }) {
  const d = g.discovery;
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
      <SvgImgInflight entries={g.imgJournal} warning={g.imgJournalWarning} busy={g.busy?.startsWith("Regenerating AI sources") ?? false}
        onRetry={g.retryImageUnknown} onDismiss={g.dismissImageJournal} />
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
const SvgStatus = memo(function SvgStatus({ rootName, totals, done, total, provider, keySet, running }: {
  rootName: string; totals: SvgGenApi["totals"]; done: number; total: number; provider: string; keySet: boolean; running: boolean;
}) {
  return (
    <footer className="svg-statusbar" data-testid="svg-statusbar">
      <div className="svg-status-group">
        <span>{rootName === "" ? "No folder picked yet" : `Root ${rootName}`}</span>
        <span data-testid="svg-status-totals">visible usage {totals.tokens ?? "—"} tokens · {costText({ reported: totals.cost, estimated: totals.estimated })}</span>
        <span data-testid="svg-status-progress">{done} / {total} generated</span>
      </div>
      <div className="svg-status-group">
        <span>{provider}</span>
        <span>{keySet ? "key stored locally" : "no API key"}</span>
        {running && <span className="running" data-testid="svg-status-running">generation in flight</span>}
      </div>
    </footer>
  );
});

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
