// ui/GenerateSvgPanel.tsx — Generate SVG tab composition: approved Selection
// index, global checks/history, Requesty preflight, row review and recovery.

import { useCallback, useMemo, useState } from "react";
import type { DirHandleLike } from "../../lib/fs";
import type { SvgReviewDecision, SvgLoadedVersion, SvgSourceRow as SourceRow } from "../types";
import { useSelectionV2 } from "../../selectionv2/useSelectionV2";
import { showNewestCode, useSvgHotkeys } from "./hotkeys";
import { retryRecoverableSvg } from "../recovery";
import { useSvgPreferences, type SvgPreferencePatch } from "./useSvgPreferences";
import { useSvgIndex } from "./useSvgIndex";
import { useSvgRun } from "./useSvgRun";
import { useSvgReview } from "./useSvgReview";
import { useRequestyKey } from "./useRequestyKey";
import SvgHeader, { type SvgHeaderProps } from "./SvgHeader";
import SvgFilterBar from "./SvgFilterBar";
import SvgBulkToolbar from "./SvgBulkToolbar";
import SvgSourceRowComponent from "./SvgSourceRow";
import SvgStatusFooter from "./SvgStatusFooter";
import SvgOverlayHost, { type SvgDialogState } from "./SvgOverlayHost";
import "./svg.css";

type Selection = ReturnType<typeof useSelectionV2>;
type Settings = ReturnType<typeof useSvgPreferences>;
type Index = ReturnType<typeof useSvgIndex>;
type Run = ReturnType<typeof useSvgRun>;
type Credentials = ReturnType<typeof useRequestyKey>;
type Review = ReturnType<typeof useSvgReview>;

interface PanelInput { selection: Selection; settings: Settings; index: Index; run: Run; credentials: Credentials; reviews: Review }
interface PanelModel {
  dialog: SvgDialogState | null; setDialog: (dialog: SvgDialogState | null) => void;
  notice: string | null; setNotice: (notice: string | null) => void;
  edit: Settings["edit"]; rows: SourceRow[]; selected: SourceRow[];
  selectedCount: number; hiddenCount: number; activeId: string | null;
  counts: { eligible: number; generated: number; reviewed: number; failed: number };
  prepare: (rows: SourceRow[]) => void;
  reviewRows: (rows: SourceRow[], decision: SvgReviewDecision, version?: number) => void;
  closeDialog: () => void; confirm: () => void;
  code: (row: SourceRow, version: SvgLoadedVersion) => void;
  recover: (row: SourceRow) => void;
}

export default function GenerateSvgPanel() {
  const selection = useSelectionV2();
  const settings = useSvgPreferences();
  const index = useSvgIndex(selection.core, settings.prefs);
  const run = useSvgRun();
  const credentials = useRequestyKey();
  const reviews = useSvgReview();
  const model = usePanelModel({ selection, settings, index, run, credentials, reviews });
  return <GenerateSvgWorkspace model={model} selection={selection} settings={settings} index={index} run={run} credentials={credentials} />;
}

function usePanelModel(input: PanelInput): PanelModel {
  const [dialog, setDialog] = useState<SvgDialogState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const edit = useSvgEdit(input.settings.edit, setNotice);
  const rows = useMemo(() => applyActiveState(input.index.visible, input.run.activeIds), [input.index.visible, input.run.activeIds]);
  const selected = rows.filter((row) => input.selection.checked.includes(row.pairId));
  const selectedCount = input.index.rows.filter((row) => input.selection.checked.includes(row.pairId)).length;
  const activeId = currentActiveId(rows, input.selection.core.s.selectedId);
  const counts = sourceCounts(input.index.rows);
  const prepare = usePrepare(input, setDialog, setNotice);
  const reviewRows = useReview(input, setNotice);
  const closeDialog = useCloseDialog(dialog, input.run.dismissPlan, input.credentials.setError, setDialog);
  const confirm = useConfirm(input.run.run, setDialog);
  const code = useCode(setDialog);
  const recover = useRecover(input.index.rootRef.current, setNotice);
  useSvgHotkeys({ enabled: dialog === null, rows, activeId, selection: input.selection, generate: prepare, review: reviewRows, code });
  return { dialog, setDialog, notice, setNotice, edit, rows, selected, selectedCount,
    hiddenCount: Math.max(0, selectedCount - selected.length), activeId, counts,
    prepare, reviewRows, closeDialog, confirm, code, recover };
}

// ideal-size: 23 lines reason=one screen composition orders independently-owned header, actions, rows, status, and modal regions without wrapper-only components.
function GenerateSvgWorkspace({ model, selection, settings, index, run, credentials }: {
  model: PanelModel; selection: Selection; settings: Settings; index: Index; run: Run; credentials: Credentials;
}) {
  return (
    <main className="svg-app" data-testid="svg-panel">
      <SvgHeader {...makeHeaderProps({ model, settings, index, credentials, chooseRoot: selection.core.chooseRoot })}
        onRescan={() => void index.rescan()} />
      <SvgFilterBar prefs={settings.prefs} edit={model.edit} shown={index.visible.length} total={index.rows.length} />
      {model.notice && <Notice message={model.notice} onClose={() => model.setNotice(null)} />}
      {run.message && <Notice message={run.message} onClose={() => run.setMessage(null)} />}
      <SvgBulkToolbar rows={model.rows} selected={model.selected} selectedCount={model.selectedCount} hiddenCount={model.hiddenCount}
        prefs={settings.prefs} progress={run.progress} running={run.running} preparing={run.preparing} stage={run.stage}
        edit={model.edit} setChecked={selection.setCheckedIds} clearChecked={selection.uncheckAll}
        onGenerate={model.prepare} onReview={(rows, decision) => model.reviewRows(rows, decision)} onCancel={run.cancel} />
      <RowsSurface model={model} selection={selection} index={index} settings={settings} run={run} />
      <SvgStatusFooter rows={index.rows} indexing={index.busy} unreadable={index.unreadable}
        message={model.notice ?? run.message} results={run.results} />
      <SvgOverlayHost dialog={model.dialog} rows={index.rows} root={index.rootRef} plan={run.plan} credentials={credentials} run={run.run}
        onClose={model.closeDialog} onConfirm={model.confirm} onCode={model.code}
        onReview={(row, version, decision) => model.reviewRows([row], decision, version)} onNotice={model.setNotice} />
    </main>
  );
}

interface RowsSurfaceProps { model: PanelModel; selection: Selection; index: Index; settings: Settings; run: Run }

function RowsSurface(p: RowsSurfaceProps) {
  return <section className="svg-list" aria-label="Approved SVG source images">
    <div className="svg-list-heading"><h1>APPROVED SOURCES / SVG OUTPUT</h1><span>{p.model.rows.length} sources · per-file sidecars</span></div>
    <div className="svg-table-scroll"><ListColumns /><div className="svg-rows" role="list" data-testid="svg-rows">
      <SourceRows {...p} />
    </div></div>
  </section>;
}

function SourceRows({ model, selection, index, settings, run }: RowsSurfaceProps) {
  if (model.rows.length === 0) return <EmptyRows />;
  return <>{model.rows.map((row) => <SvgSourceRowComponent key={row.sourceId} row={row} root={index.rootRef}
    active={row.pairId === model.activeId} checked={selection.checked.includes(row.pairId)} generation={row.generation}
    thumbHeight={settings.prefs.thumbHeight} busy={run.running || run.preparing}
    onSelect={() => selection.core.select(row.pairId)} onCheck={() => selection.toggleCheck(row.pairId)}
    onGenerate={() => model.prepare([row])} onReview={(decision) => model.reviewRows([row], decision)}
    onCode={() => showNewestCode(row, model.code)} onHistory={() => model.setDialog({ kind: "history", sourceId: row.sourceId })}
    onRecover={() => model.recover(row)} />)}</>;
}

function ListColumns() {
  return <div className="svg-columns" aria-hidden="true"><span></span><span>AI / newest SVG</span><span>File / path / persistence</span>
    <span>Generation</span><span>Review</span><span>Version / usage / cost</span><span>Files / history</span><span>Generate / decision</span></div>;
}

function EmptyRows() {
  return <p className="svg-empty" data-testid="svg-empty">No Selection-approved AI images yet. Approve AI results in Selection, then rescan.</p>;
}

function Notice({ message, onClose }: { message: string; onClose: () => void }) {
  return <div className="svg-notice" role="status" aria-live="polite"><span>{message}</span><button type="button" onClick={onClose} aria-label="Dismiss notice">×</button></div>;
}

function makeHeaderProps(input: { model: PanelModel; settings: Settings; index: Index; credentials: Credentials; chooseRoot: () => void }): SvgHeaderProps {
  const { model, settings, index, credentials } = input;
  return {
    rootName: index.rootName, eligible: model.counts.eligible, generated: model.counts.generated,
    reviewed: model.counts.reviewed, failed: model.counts.failed, indexing: index.busy, unreadable: index.unreadable,
    hasKey: credentials.available, keyBusy: credentials.busy, prompt: settings.prefs.prompt, model: settings.prefs.model,
    imagesPerRequest: settings.prefs.imagesPerRequest, concurrency: settings.prefs.concurrency,
    timeoutMs: settings.prefs.timeoutMs, retries: settings.prefs.rateLimitRetries, cellSize: settings.prefs.cellSize,
    edit: model.edit, onChooseRoot: input.chooseRoot, onManageKey: () => model.setDialog({ kind: "key" }), onNotice: model.setNotice,
    onRescan: () => void index.rescan(),
  };
}

function useSvgEdit(edit: Settings["edit"], setNotice: (message: string | null) => void): Settings["edit"] {
  return useCallback((patch: SvgPreferencePatch, label: string, gesture = false) => {
    const ok = edit(patch, label, gesture);
    if (!ok) setNotice("Credential-like text was blocked and not saved.");
    return ok;
  }, [edit, setNotice]);
}

function usePrepare(input: PanelInput, setDialog: (dialog: SvgDialogState | null) => void, setNotice: (notice: string | null) => void) {
  const prepareRun = input.run.prepare;
  const available = input.credentials.available;
  const root = input.index.rootRef;
  const prefs = input.settings.prefs;
  return useCallback(async (rows: SourceRow[]) => {
    if (!available) { setDialog({ kind: "key" }); return; }
    const ready = await prepareRun(root.current, rows, prefs);
    if (ready) { setNotice(null); setDialog({ kind: "confirm" }); }
  }, [available, prepareRun, root, prefs, setDialog, setNotice]);
}

function useReview(input: PanelInput, setNotice: (notice: string | null) => void) {
  const apply = input.reviews.review;
  const root = input.index.rootRef;
  return useCallback((rows: SourceRow[], decision: SvgReviewDecision, version?: number) => {
    void apply(root.current, rows, decision, version).then(setNotice);
  }, [apply, root, setNotice]);
}

function useCloseDialog(
  dialog: SvgDialogState | null, dismiss: Run["dismissPlan"], clearError: Credentials["setError"],
  setDialog: (dialog: SvgDialogState | null) => void,
) {
  return useCallback(() => closeOverlay(dialog, dismiss, clearError, setDialog), [dialog, dismiss, clearError, setDialog]);
}

function useConfirm(run: Run["run"], setDialog: (dialog: SvgDialogState | null) => void) {
  return useCallback(() => { setDialog(null); void run(); }, [run, setDialog]);
}

function useCode(setDialog: (dialog: SvgDialogState | null) => void) {
  return useCallback((row: SourceRow, version: SvgLoadedVersion) => {
    setDialog({ kind: "code", sourceId: row.sourceId, version: version.version });
  }, [setDialog]);
}

function useRecover(root: DirHandleLike | null, setNotice: (notice: string | null) => void) {
  return useCallback((row: SourceRow) => { void recoverTemporary(root, row, setNotice); }, [root, setNotice]);
}

function applyActiveState(rows: SourceRow[], activeIds: string[]): SourceRow[] {
  const active = new Set(activeIds);
  return rows.map((row) => active.has(row.sourceId) ? { ...row, generation: "generating" } : row);
}

function currentActiveId(rows: SourceRow[], selectedId: string | null): string | null {
  return rows.some((row) => row.pairId === selectedId) ? selectedId : rows[0]?.pairId ?? null;
}

function sourceCounts(rows: SourceRow[]) {
  return {
    eligible: rows.length,
    generated: rows.filter((row) => ["generated", "recovered", "recoverable"].includes(row.generation)).length,
    reviewed: rows.filter((row) => row.review === "approved").length,
    failed: rows.filter((row) => ["failed", "unknown", "corrupt"].includes(row.generation)).length,
  };
}

function closeOverlay(
  dialog: SvgDialogState | null, dismiss: Run["dismissPlan"], clearError: Credentials["setError"],
  setDialog: (dialog: SvgDialogState | null) => void,
): void {
  if (dialog?.kind === "confirm") dismiss();
  if (dialog?.kind === "key") clearError(null);
  setDialog(null);
}

async function recoverTemporary(root: DirHandleLike | null, row: SourceRow, setNotice: (message: string | null) => void): Promise<void> {
  if (!root) { setNotice("Source folder is unavailable; recovery was not attempted."); return; }
  const result = await retryRecoverableSvg(root, row);
  setNotice(recoveryMessage(result));
}

function recoveryMessage(result: Awaited<ReturnType<typeof retryRecoverableSvg>>): string {
  const messages = {
    saved: "Validated SVG was recovered without overwriting an existing version.",
    "not-found": "Recoverable temporary SVG was not found; rescan the source folder.",
    invalid: "Temporary file failed SVG validation and was not saved.",
    "not-approved": "Source is no longer approved or its fingerprint changed; temporary SVG was not promoted.",
    conflict: "The target version already exists or safe atomic promotion failed; no file was overwritten.",
    unsupported: "This browser cannot atomically rename the recovery temp. It remains untouched.",
  };
  return messages[result];
}
