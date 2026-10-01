// BatchPanel.tsx owns the batch tab: review state, busy/toast surfaces,
// sidebar + review + process wiring. Scan/process logic lives in *Flow.

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { defaultPreset, settingsOf, type BatchSettings as BatchSettingsState } from "../../batch/presets";
import { batchReducer, initBatch, type BatchItem, type BatchState } from "../../batch/reducer";
import BatchSettings from "./BatchSettings";
import FolderPickers from "./FolderPickers";
import PresetBar from "./PresetBar";
import ProcessBar from "./ProcessBar";
import { runProcess } from "./processFlow";
import ScanList from "./ScanList";
import { autoloadLastPreset } from "./presetFlow";
import { pickDest, pickSource, revokeThumbs, runScan, type FlowCtx, type Say } from "./scanFlow";

const DEFAULT_SETTINGS: BatchSettingsState = settingsOf(defaultPreset("", "1970-01-01T00:00:00.000Z"));

interface Toast {
  msg: string;
  err?: boolean;
}

function useToast(): [Toast | null, Say] {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef(0);
  const say = useCallback<Say>((msg, err = false) => {
    setToast({ msg, err });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  return [toast, say];
}

function confirmAndRun(ctx: FlowCtx, done: (items: BatchItem[] | null) => void, allow: boolean): void {
  done(null);
  void runProcess(ctx, allow);
}

function BatchSidebar(props: { ctx: FlowCtx; busy: boolean }) {
  const { snap, dispatch, say } = props.ctx;
  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <FolderPickers folders={snap.folders} busy={props.busy} onSource={() => void pickSource(props.ctx)} onDest={() => void pickDest(props.ctx)} onRefresh={() => void runScan(props.ctx)} onDestMode={(v) => dispatch({ type: "dest-mode", useCustom: v })} />
      <PresetBar settings={snap.settings} folders={snap.folders} dispatch={dispatch} say={say} />
      <BatchSettings settings={snap.settings} say={say} onChange={(s) => dispatch({ type: "settings-set", settings: s })} />
    </aside>
  );
}

function BatchMain(props: { ctx: FlowCtx; busy: boolean; confirm: BatchItem[] | null; onConfirm: (allow: boolean) => void }) {
  const { snap, dispatch, say } = props.ctx;
  return (
    <div className="space-y-6">
      <ScanList items={snap.items} selected={snap.selected} rootName={snap.folders.sourceName} say={say} onToggle={(r) => dispatch({ type: "toggle", relPath: r })} onAll={() => dispatch({ type: "select-all" })} onNone={() => dispatch({ type: "deselect-all" })} />
      <ProcessBar count={snap.selected.length} busy={props.busy} confirm={props.confirm} onProcess={() => void runProcess(props.ctx, null)} onCancel={() => { props.ctx.abort.current = true; }} onConfirm={props.onConfirm} />
    </div>
  );
}

function BatchBusy(props: { busy: string | null }) {
  if (!props.busy) return null;
  return (
    <div data-testid="batch-busy-overlay" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 px-6 py-4 shadow-2xl">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        <span data-testid="batch-busy-message" className="text-sm">{props.busy}</span>
      </div>
    </div>
  );
}

function BatchToast(props: { toast: Toast | null }) {
  if (!props.toast) return null;
  const tone = props.toast.err ? "bg-rose-600" : "bg-emerald-600";
  return <div data-testid="batch-toast" className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-medium shadow-xl ${tone}`}>{props.toast.msg}</div>;
}

function freshState(): BatchState {
  return initBatch(DEFAULT_SETTINGS);
}

export default function BatchPanel() {
  const [state, dispatch] = useReducer(batchReducer, undefined, freshState);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<BatchItem[] | null>(null);
  const [toast, say] = useToast();
  const abortRef = useRef(false);
  const thumbsRef = useRef<string[]>([]);
  useEffect(() => {
    autoloadLastPreset(dispatch, say);
  }, [dispatch, say]);
  useEffect(() => () => revokeThumbs(thumbsRef), []);
  const ctx: FlowCtx = { snap: state, dispatch, say, setBusy, thumbs: thumbsRef, abort: abortRef, onMissingRefs: setConfirm };
  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <BatchSidebar ctx={ctx} busy={busy !== null} />
        <BatchMain ctx={ctx} busy={busy !== null} confirm={confirm} onConfirm={(allow) => confirmAndRun(ctx, setConfirm, allow)} />
      </div>
      <BatchBusy busy={busy} />
      <BatchToast toast={toast} />
    </main>
  );
}
