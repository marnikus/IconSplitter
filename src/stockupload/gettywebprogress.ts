// gettywebprogress.ts — Getty's live per-file counts while a batch is in flight.
// The panel polls the helper instead of sitting still until the batch lands, and
// every reading (thumbnail counts included) is reported at once.

import { gettyWebProgress, type GettyWebProgress } from "../lib/stockupload/gettyprogress";

/** Which half of the run a reading belongs to: bytes in, or chips flipping. */
export function progressPhase(progress: GettyWebProgress): "uploading" | "verifying" {
  return progress.phase === "uploading" ? "uploading" : "verifying";
}

/** The panel line for a live upload reading: what Getty has taken so far. */
export function progressLabel(progress: GettyWebProgress, targetName: string, batch = ""): string {
  const head = batch === "" ? `${targetName}: ` : `${targetName}: ${batch} · `;
  const of = progress.total > 0 ? ` of ${progress.total}` : "";
  const failed = progress.failed > 0 ? `, ${progress.failed} failed` : "";
  const reloaded = progress.reloads > 0 ? " — page reloaded to get it moving" : "";
  const ready = progress.ready ?? 0;
  if (progress.uploaded === 0 && progress.failed === 0) return `${head}uploading ${progress.listed}${of} file(s)${reloaded}`;
  // Readiness is what makes a file submittable, so it is said out loud — and the
  // files Getty took but never validated are named as a count, never hidden.
  if (ready > 0) {
    const pending = unvalidatedOf(progress);
    const notReady = pending > 0 ? `, ${pending} not ready yet` : "";
    return `${head}${ready}${of} file(s) ready to submit${failed}${notReady}${reloaded}`;
  }
  return `${head}${progress.uploaded}${of} file(s) uploaded${failed}${reloaded}`;
}

/** Files Getty received but never marked "Ready to submit" — not submittable. */
function unvalidatedOf(progress: GettyWebProgress): number {
  return Math.max(0, (progress.uploaded ?? 0) - (progress.ready ?? 0) - progress.failed);
}

/**
 * Files Getty has really settled. While the bytes are arriving the arrival count
 * is the honest one; once Getty is validating, only its "Ready to submit" chips
 * count — a received file is not an uploaded one.
 */
export function settledFiles(progress: GettyWebProgress): number {
  const ready = progress.phase === "uploading" ? progress.uploaded : (progress.ready ?? 0);
  return ready + progress.failed;
}

const PROGRESS_POLL_MS = 1000;
// The helper answers 404 until its upload request is being handled, and a helper
// that dies mid-run says nothing at all: neither may kill the live progress.
const PROGRESS_MAX_MISSES = 60;

type ProgressPoll = (bridgeUrl: string, sessionKey: string) => Promise<GettyWebProgress | null>;

interface WatchState {
  input: { bridgeUrl: string; sessionKey: string };
  report: (progress: GettyWebProgress) => void;
  poll: ProgressPoll;
  stopped: boolean;
  misses: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** One reading, then the next poll — a missing helper is retried, not fatal. */
async function progressTick(state: WatchState): Promise<void> {
  if (state.stopped) return;
  const progress = await state.poll(state.input.bridgeUrl, state.input.sessionKey).catch(() => null);
  if (state.stopped) return;
  if (progress === null) state.misses += 1;
  else {
    state.misses = 0;
    state.report(progress);
    if (progress.phase === "done" || progress.phase === "failed") return;
  }
  if (state.misses <= PROGRESS_MAX_MISSES) {
    state.timer = setTimeout(() => void progressTick(state), PROGRESS_POLL_MS);
  }
}

/**
 * Polls the helper while the upload requests are in flight, so the panel shows
 * Getty's own per-file progress instead of sitting still until the batch lands.
 * Returns its stop function; the first reading is taken immediately.
 */
export function watchGettyProgress(
  input: { bridgeUrl: string; sessionKey: string; targetName: string },
  onProgress: (progress: GettyWebProgress) => void,
  poll: ProgressPoll = gettyWebProgress,
): () => void {
  const state: WatchState = {
    input, report: onProgress, poll, stopped: false, misses: 0, timer: null,
  };
  state.timer = setTimeout(() => void progressTick(state), 0);
  return () => {
    state.stopped = true;
    if (state.timer !== null) clearTimeout(state.timer);
  };
}
