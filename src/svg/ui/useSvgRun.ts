// ui/useSvgRun.ts — local preflight, explicit consent and bounded Requesty queue.
// Cancellation stops new batches; in-flight calls finish to avoid ambiguous aborts.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DirHandleLike } from "../../lib/fs";
import { getRequestyKey } from "../keyvault";
import type { SvgPreferences } from "../prefs";
import { prepareBatches, type PreparedBatch } from "../preflight";
import { redactSecrets, safeErrorText } from "../security";
import { runSvgBatch, type RunBatchResult } from "../run/process";
import { runQueue, type QueueProgress } from "../run/queue";
import type { SvgSourceRow } from "../types";

export interface SvgRunPlan {
  root: DirHandleLike;
  batches: PreparedBatch[];
  rows: SvgSourceRow[];
  prefs: SvgPreferences;
}

const IDLE_PROGRESS: QueueProgress = { started: 0, completed: 0, active: 0, total: 0, currentIndexes: [] };
type Setter<T> = (value: T | ((current: T) => T)) => void;
type MutableValue<T> = { current: T };

interface RunState {
  plan: SvgRunPlan | null;
  setPlan: Setter<SvgRunPlan | null>;
  preparing: boolean;
  setPreparing: Setter<boolean>;
  running: boolean;
  setRunning: Setter<boolean>;
  message: string | null;
  setMessage: Setter<string | null>;
  stage: string;
  setStage: Setter<string>;
  progress: QueueProgress;
  setProgress: Setter<QueueProgress>;
  results: RunBatchResult[];
  setResults: Setter<RunBatchResult[]>;
  cancelRef: MutableValue<boolean>;
  liveRef: MutableValue<boolean>;
  preparingRef: MutableValue<boolean>;
  runningRef: MutableValue<boolean>;
  planRef: MutableValue<SvgRunPlan | null>;
}

interface MakePlanInput {
  root: DirHandleLike;
  rows: SvgSourceRow[];
  prefs: SvgPreferences;
  setPlan: Setter<SvgRunPlan | null>;
  setMessage: Setter<string | null>;
  live: MutableValue<boolean>;
}

interface ExecutePlanInput {
  plan: SvgRunPlan;
  key: string;
  cancel: MutableValue<boolean>;
  setProgress: Setter<QueueProgress>;
  setStage: Setter<string>;
}

export function useSvgRun() {
  const state = useRunState();
  const prepare = usePrepareAction(state);
  const run = useRunAction(state);
  const cancel = useCancelAction(state.cancelRef, state.setMessage);
  const dismissPlan = useDismissPlan(state);
  const activeIds = activeSourceIds(state.plan, state.progress);
  return { plan: state.plan, preparing: state.preparing, running: state.running, message: state.message,
    stage: state.stage, progress: state.progress, results: state.results, activeIds, prepare, run, cancel,
    dismissPlan, setMessage: state.setMessage };
}

// ideal-size: 21 lines reason=run state, liveness refs and batch URL cleanup share one hook lifecycle so unmount invalidation stays atomic.
function useRunState(): RunState {
  const [plan, setPlan] = useState<SvgRunPlan | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stage, setStage] = useState("Ready");
  const [progress, setProgress] = useState(IDLE_PROGRESS);
  const [results, setResults] = useState<RunBatchResult[]>([]);
  const cancelRef = useRef(false);
  const liveRef = useRef(true);
  const preparingRef = useRef(false);
  const runningRef = useRef(false);
  const planRef = useRef<SvgRunPlan | null>(null);
  planRef.current = plan;
  useEffect(() => {
    liveRef.current = true;
    return () => { liveRef.current = false; cancelRef.current = true; releasePlan(planRef.current); };
  }, []);
  return { plan, setPlan, preparing, setPreparing, running, setRunning, message, setMessage,
    stage, setStage, progress, setProgress, results, setResults, cancelRef, liveRef, preparingRef, runningRef, planRef };
}

function usePrepareAction(state: RunState) {
  const { preparingRef, runningRef, setPreparing, setMessage, setResults, setPlan, liveRef } = state;
  return useCallback(async (root: DirHandleLike | null, rows: SvgSourceRow[], prefs: SvgPreferences) => {
    if (!root || rows.length === 0 || preparingRef.current || runningRef.current) return false;
    preparingRef.current = true; setPreparing(true); setMessage(null); setResults([]);
    try { return await makePlan({ root, rows, prefs, setPlan, setMessage, live: liveRef }); }
    finally { preparingRef.current = false; setPreparing(false); }
  }, [preparingRef, runningRef, setPreparing, setMessage, setResults, setPlan, liveRef]);
}

function useRunAction(state: RunState) {
  const { plan, setPlan, runningRef, liveRef, cancelRef, setRunning, setProgress, setStage, setResults, setMessage } = state;
  return useCallback(async () => {
    if (!plan || runningRef.current) return;
    runningRef.current = true;
    const key = await loadKey();
    if (!liveRef.current) { runningRef.current = false; return; }
    if (!key) return reportMissingKey(runningRef, setMessage);
    cancelRef.current = false; setRunning(true); setProgress({ ...IDLE_PROGRESS, total: plan.batches.length });
    setStage("Starting approved batches…");
    try {
      const completed = await executePlan({ plan, key, cancel: cancelRef, setProgress, setStage });
      applyCompleted(completed, setResults, setProgress, setMessage);
    } catch {
      setMessage("The batch queue stopped unexpectedly; request outcomes may be unknown. Check Requesty before retrying.");
    } finally {
      runningRef.current = false; setRunning(false); setPlan(null); releasePlan(plan);
    }
  }, [plan, setPlan, runningRef, liveRef, cancelRef, setRunning, setProgress, setStage, setResults, setMessage]);
}

async function loadKey(): Promise<string | null> {
  try { return await getRequestyKey(); } catch { return null; }
}

function reportMissingKey(running: MutableValue<boolean>, setMessage: Setter<string | null>): void {
  running.current = false;
  setMessage("No Requesty key is available. Add it securely before confirming.");
}

function applyCompleted(
  completed: Awaited<ReturnType<typeof executePlan>>, setResults: Setter<RunBatchResult[]>,
  setProgress: Setter<QueueProgress>, setMessage: Setter<string | null>,
): void {
  const values = completed.results.map((item) => item.value);
  setResults(values);
  setProgress((current) => ({ ...current, completed: values.length, active: 0, currentIndexes: [] }));
  setMessage(runSummaryMessage(values, completed.cancelled));
}

function useCancelAction(cancelRef: MutableValue<boolean>, setMessage: Setter<string | null>) {
  return useCallback(() => {
    cancelRef.current = true;
    setMessage("Stopping after in-flight requests finish; no new batch will start.");
  }, [cancelRef, setMessage]);
}

function useDismissPlan(state: RunState) {
  const { plan, running, setPlan } = state;
  return useCallback(() => {
    if (running) return;
    releasePlan(plan); setPlan(null);
  }, [plan, running, setPlan]);
}

function activeSourceIds(plan: SvgRunPlan | null, progress: QueueProgress): string[] {
  return plan?.batches.flatMap((batch, index) => progress.currentIndexes.includes(index)
    ? batch.manifest.map((item) => item.sourceId) : []) ?? [];
}

async function makePlan(input: MakePlanInput): Promise<boolean> {
  try {
    const prepared = await prepareBatches(input.root, input.rows, input.prefs);
    if (!input.live.current) { prepared.batches.forEach((batch) => URL.revokeObjectURL(batch.compositeUrl)); return false; }
    input.setPlan({ root: input.root, batches: prepared.batches, rows: input.rows, prefs: input.prefs });
    return true;
  } catch (error) {
    input.setMessage(safeErrorText(error instanceof Error ? error.message : "Local image preflight failed.") ?? "Local image preflight failed.");
    return false;
  }
}

async function executePlan(input: ExecutePlanInput) {
  return runQueue({
    batches: input.plan.batches, concurrency: input.plan.prefs.concurrency,
    continueWork: () => !input.cancel.current,
    onProgress: input.setProgress,
    run: (batch) => runSvgBatch({ root: input.plan.root, batch, prefs: input.plan.prefs, key: input.key, onStage: input.setStage }),
    onFailure: (batch, _index, error) => unexpectedResult(batch, error, input.key),
  });
}

function unexpectedResult(batch: PreparedBatch, error: unknown, key: string): RunBatchResult {
  const detail = error instanceof Error ? error.message : "Unexpected generation error.";
  return {
    batchId: batch.batchId, clientRequestId: null, providerRequestId: null, state: "unknown",
    summary: { successful: 0, failed: 0, missing: 0, invalid: 0, unknown: batch.rows.length },
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, actualCostUsd: null },
    warning: null, sidecarFailures: 0,
    safeError: safeErrorText(redactSecrets(detail, key)) ?? "Unexpected error; request outcome is unknown. Do not resubmit automatically.",
  };
}

function runSummaryMessage(results: RunBatchResult[], cancelled: number): string {
  const saved = results.reduce((sum, item) => sum + item.summary.successful, 0);
  const failed = results.reduce((sum, item) => sum + item.summary.failed + item.summary.invalid + item.summary.missing, 0);
  const unknown = results.reduce((sum, item) => sum + item.summary.unknown, 0);
  const sidecarFailures = results.reduce((sum, item) => sum + item.sidecarFailures, 0);
  return `Run finished: ${saved} saved, ${failed} failed/missing/invalid, ${unknown} unknown, ${cancelled} batches not started, ${sidecarFailures} sidecar writes need recovery.`;
}

function releasePlan(plan: SvgRunPlan | null): void {
  plan?.batches.forEach((batch) => URL.revokeObjectURL(batch.compositeUrl));
}
