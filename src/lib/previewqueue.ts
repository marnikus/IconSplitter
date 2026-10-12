// previewqueue.ts — the preview session's scheduler (design D3/D4/D5, T5).
// Owns: plan order (near-viewport rows first, then list order), one job in flight,
// generation-based cancellation, and per-row isolation — a row that throws is
// reported, never a reason to stop the session (I-68). Pure logic: no React, no
// DOM, no IO; the caller injects each row's work and (optionally) the pause.

export interface QueueToken {
  /** The plan generation this job belongs to; the caller stores results under it. */
  readonly generation: number;
  /** True once the session was cancelled or replanned: finish, then emit nothing. */
  readonly cancelled: boolean;
}

export type RowResult<T> = { kind: "ok"; value: T } | { kind: "empty" } | { kind: "error"; message: string };

export interface PreviewRow<T> {
  key: string;
  /** Inside the viewport window (± overscan, D4); those rows are planned first. */
  near: boolean;
  work: (token: QueueToken) => Promise<RowResult<T>>;
}

export type QueueEvent<T> =
  | { kind: "row-done"; key: string; generation: number; value: T }
  | { kind: "row-empty"; key: string; generation: number }
  | { kind: "row-error"; key: string; generation: number; message: string }
  | { kind: "row-stopped"; key: string; generation: number }
  | { kind: "idle"; generation: number };

export interface Progress {
  done: number;
  total: number;
  icons: number;
}

export interface PreviewQueue<T> {
  /** Plan a new set of rows. Same keys + same generation while running is a no-op. */
  setRows(rows: PreviewRow<T>[], generation: number): void;
  cancel(): void;
  on(listener: (event: QueueEvent<T>) => void): () => void;
  /** Resolves when the queue has drained (used by tests and by the end toast). */
  settled(): Promise<void>;
  progress(): Progress;
  dispose(): void;
}

export interface QueueDeps {
  /** Cooperative pause between rows; overridable so tests stay synchronous. */
  pause?: () => Promise<void>;
}

interface QState<T> {
  pause: () => Promise<void>;
  listeners: Set<(event: QueueEvent<T>) => void>;
  queue: PreviewRow<T>[];
  generation: number;
  plannedKeys: string;
  done: number;
  total: number;
  icons: number;
  cancelled: boolean;
  pumping: Promise<void> | null;
  drain: Promise<void>;
  endDrain: () => void;
}

const defaultPause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function createPreviewQueue<T>(deps: QueueDeps = {}): PreviewQueue<T> {
  const st: QState<T> = {
    pause: deps.pause ?? defaultPause,
    listeners: new Set(),
    queue: [],
    generation: 0,
    plannedKeys: "",
    done: 0,
    total: 0,
    icons: 0,
    cancelled: false,
    pumping: null,
    drain: Promise.resolve(),
    endDrain: () => undefined,
  };
  return {
    setRows: (rows, generation) => setRows(st, rows, generation),
    cancel: () => cancelAll(st),
    on: (listener) => subscribe(st, listener),
    settled: () => st.drain,
    progress: () => ({ done: st.done, total: st.total, icons: st.icons }),
    dispose: () => dispose(st),
  };
}

// ---- planning ------------------------------------------------------------------

function setRows<T>(st: QState<T>, rows: PreviewRow<T>[], generation: number): void {
  const keys = rows.map((r) => r.key).sort().join("\u0000");
  if (generation === st.generation && keys === st.plannedKeys && (st.pumping || st.queue.length > 0)) return;
  st.cancelled = true; // the old loop stops at its next row boundary
  st.queue = [];
  st.generation = generation;
  st.plannedKeys = keys;
  st.done = 0;
  st.total = rows.length;
  st.icons = 0;
  st.cancelled = false;
  if (rows.length === 0) {
    emit(st, { kind: "idle", generation });
    return;
  }
  st.queue = [...rows];
  ensurePumping(st);
}

function cancelAll<T>(st: QState<T>): void {
  st.cancelled = true;
  st.queue = [];
}

function subscribe<T>(st: QState<T>, listener: (event: QueueEvent<T>) => void): () => void {
  st.listeners.add(listener);
  return () => st.listeners.delete(listener);
}

function dispose<T>(st: QState<T>): void {
  cancelAll(st);
  st.listeners.clear();
}

function emit<T>(st: QState<T>, event: QueueEvent<T>): void {
  for (const l of st.listeners) l(event);
}

// ---- the one loop --------------------------------------------------------------

/**
 * ONE long-lived loop. A replan does not start a second one: the running loop
 * picks the new queue up after its current row, so exactly one row is ever in
 * flight (D5) and a superseded row is never painted (D3).
 */
async function pump<T>(st: QState<T>): Promise<void> {
  while (!st.cancelled) {
    const row = takeNext(st);
    if (!row) break;
    await runRow(st, row);
    await st.pause();
  }
  if (st.queue.length === 0) emit(st, { kind: "idle", generation: st.generation });
}

function ensurePumping<T>(st: QState<T>): void {
  if (st.pumping) return;
  st.drain = new Promise<void>((resolve) => (st.endDrain = resolve));
  st.pumping = pump(st).then(() => {
    st.pumping = null;
    st.endDrain();
  });
}

/** The next row: nearest first, then the caller's own order (D4). */
function takeNext<T>(st: QState<T>): PreviewRow<T> | undefined {
  const near = st.queue.findIndex((r) => r.near);
  return st.queue.splice(near < 0 ? 0 : near, 1)[0];
}

function tokenFor<T>(st: QState<T>, generation: number): QueueToken {
  return {
    generation,
    get cancelled() {
      return st.cancelled || generation !== st.generation;
    },
  };
}

async function runRow<T>(st: QState<T>, row: PreviewRow<T>): Promise<void> {
  const token = tokenFor(st, st.generation);
  try {
    const result = await row.work(token);
    if (token.cancelled) emit(st, { kind: "row-stopped", key: row.key, generation: token.generation });
    else settle(st, row, result, token.generation);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (token.cancelled) emit(st, { kind: "row-stopped", key: row.key, generation: token.generation });
    else fail(st, row, message, token.generation);
  }
}

function settle<T>(st: QState<T>, row: PreviewRow<T>, result: RowResult<T>, generation: number): void {
  st.done++;
  if (result.kind === "ok") {
    st.icons++;
    emit(st, { kind: "row-done", key: row.key, generation, value: result.value });
  } else if (result.kind === "empty") emit(st, { kind: "row-empty", key: row.key, generation });
  else fail(st, row, result.message, generation);
}

/** A row that failed: counted as finished (it is over) and reported on its row. */
function fail<T>(st: QState<T>, row: PreviewRow<T>, message: string, generation: number): void {
  st.done++;
  emit(st, { kind: "row-error", key: row.key, generation, message });
}
