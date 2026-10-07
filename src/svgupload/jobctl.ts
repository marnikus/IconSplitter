// jobctl.ts — running many icons without losing any of them (design §16).
// Three promises are encoded here, and each one has a test:
//   · BOUNDED work — at most `concurrency` exports and at most ONE metadata
//     request in flight at a time (the transport's one-in-flight discipline);
//   · CANCEL MEANS CANCEL — nothing unsent is sent, nothing uncommitted is
//     committed, and a package that finished before the cancel arrived is KEPT;
//   · RESTART IS NOT A RETRY — a job that was running when the app closed comes
//     back as `interrupted / needs review`, never as an active job that quietly
//     spends money again.
// The queue holds no state about the files: `run` is the exporter, and the queue
// only schedules it and reports what happened.

export type JobState = "queued" | "running" | "processed" | "partial" | "failed" | "cancelled" | "interrupted";

export interface JobEvent {
  id: string;
  state: JobState;
  /** The stage the item is in, when it is running. */
  stage?: string;
  /** A one-line message for the row (never a raw stack). */
  note?: string;
}

export interface JobResult {
  state: Exclude<JobState, "queued" | "running" | "interrupted">;
  note: string;
}

export interface QueueOpts {
  /** How many exports may run at once; one metadata request regardless (§16). */
  concurrency: number;
  run: (id: string, signal: AbortSignal) => Promise<JobResult>;
  onEvent: (event: JobEvent) => void;
}

/** A bounded, cancellable queue of export jobs. */
export class ExportQueue {
  private readonly pending: string[] = [];
  private readonly running = new Map<string, Promise<void>>();
  private readonly states = new Map<string, JobState>();
  private readonly controller = new AbortController();
  private stopped = false;

  constructor(private readonly opts: QueueOpts) {}

  /** Adds icons at the end; a duplicate id is ignored, never queued twice. */
  add(ids: readonly string[]): void {
    for (const id of ids) {
      if (this.states.has(id)) continue;
      this.states.set(id, "queued");
      this.pending.push(id);
      this.emit({ id, state: "queued" });
    }
  }

  /** Runs until every queued item finished, failed or was cancelled. */
  async pump(): Promise<void> {
    while (!this.stopped && (this.pending.length > 0 || this.running.size > 0)) {
      this.fill();
      if (this.running.size === 0 && this.pending.length > 0) break; // concurrency 0: nothing can run
      await Promise.race([...this.running.values()]);
    }
    this.settleRemaining();
  }

  /** Stops unsent work; the in-flight requests are aborted, not waited out. */
  cancel(): void {
    this.stopped = true;
    this.controller.abort(new Error("cancelled"));
    for (const id of [...this.pending]) this.set(id, "cancelled", { note: "Cancelled before it started." });
    this.pending.length = 0;
  }

  /** The state of every icon this queue has seen — the panel's row source. */
  snapshot(): Record<string, JobState> {
    return Object.fromEntries(this.states);
  }

  /** Items waiting for a slot. */
  waiting(): readonly string[] {
    return [...this.pending];
  }

  /** Starts as many items as there are free slots. */
  private fill(): void {
    const slots = Math.max(0, this.opts.concurrency - this.running.size);
    for (const id of this.pending.splice(0, slots)) this.launch(id);
  }

  private launch(id: string): void {
    this.set(id, "running");
    const job = this.opts.run(id, this.controller.signal)
      .then((result) => { this.set(id, result.state, { note: result.note }); })
      .catch((error: unknown) => { this.set(id, "failed", { note: messageOf(error) }); })
      .finally(() => { this.running.delete(id); });
    this.running.set(id, job);
  }

  /** Everything that never ran, and anything still in flight at the end. */
  private settleRemaining(): void {
    for (const id of [...this.pending]) this.set(id, "cancelled", { note: "Cancelled before it started." });
    this.pending.length = 0;
    for (const id of [...this.running.keys()]) this.set(id, "cancelled", { note: "Cancelled in flight." });
  }

  private set(id: string, state: JobState, extra: { stage?: string; note?: string } = {}): void {
    this.states.set(id, state);
    this.emit({ id, state, ...extra });
  }

  private emit(event: JobEvent): void {
    this.opts.onEvent(event);
  }
}

/** The jobs a previous session left unfinished, as the UI must show them. */
export function restoreInterrupted(previous: Record<string, JobState>): { states: Record<string, JobState>; note: string | null } {
  const states: Record<string, JobState> = {};
  let count = 0;
  for (const [id, state] of Object.entries(previous)) {
    if (state === "running" || state === "queued") {
      states[id] = "interrupted";
      count += 1;
      continue;
    }
    states[id] = state;
  }
  if (count === 0) return { states, note: null };
  return {
    states,
    note: `${count} export${count === 1 ? "" : "s"} did not finish before the app closed. They are marked interrupted — nothing was sent again; use Retry to continue.`,
  };
}

/** Green only for a package that validated and committed; everything else shows why. */
export function rowStateOf(state: JobState): { tone: "ok" | "warn" | "bad" | "busy" | "idle"; label: string } {
  if (state === "processed") return { tone: "ok", label: "Processed" };
  if (state === "partial") return { tone: "warn", label: "Partial" };
  if (state === "interrupted") return { tone: "warn", label: "Interrupted — needs review" };
  if (state === "cancelled") return { tone: "idle", label: "Cancelled" };
  if (state === "failed") return { tone: "bad", label: "Failed" };
  if (state === "running") return { tone: "busy", label: "Processing" };
  return { tone: "idle", label: "Queued" };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
