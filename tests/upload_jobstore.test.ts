// upload_jobstore.test.ts — CP-2 (merge-report §9): "restart is not a retry".
// The per-icon job store remembers the LAST run of every icon; on the next load
// every queued/running entry becomes `interrupted`, the note is emitted exactly
// ONCE per page load (StrictMode double-invokes effects), and nothing is ever
// re-sent by the store itself. RULE 13: a corrupt payload costs one ignored load.
import { beforeEach, describe, expect, it } from "vitest";
import {
  JOB_STORE_VERSION, UPLOAD_JOBS_KEY, emptyJobStore, forgetRestoreNote, interruptedIds,
  loadJobStore, markInterrupted, parseJobStore, rememberJob, saveJobStore, takeRestoreNote,
} from "../src/upload/jobstore";

beforeEach(() => {
  localStorage.clear();
  forgetRestoreNote();
});

describe("the stored shape", () => {
  it("keeps only real job states and drops the rest (RULE 13)", () => {
    const parsed = parseJobStore({
      v: JOB_STORE_VERSION,
      states: { a: "running", b: "processed", c: "sideways", d: 7 },
    });
    expect(parsed.states).toEqual({ a: "running", b: "processed" });
  });

  it("a non-object, a corrupt payload or a foreign version loads as empty", () => {
    expect(parseJobStore(null)).toEqual(emptyJobStore());
    expect(parseJobStore({ states: "nope" })).toEqual(emptyJobStore());
    localStorage.setItem(UPLOAD_JOBS_KEY, "{ not json");
    expect(loadJobStore()).toEqual(emptyJobStore());
  });
});

describe("recording a run", () => {
  it("remembers one icon's latest state without touching the others", () => {
    rememberJob("pair_a", "processed");
    rememberJob("pair_b", "failed");
    expect(loadJobStore().states).toEqual({ pair_a: "processed", pair_b: "failed" });
  });

  it("a round trip through storage is exact", () => {
    saveJobStore({ states: { pair_a: "queued" } });
    expect(loadJobStore().states).toEqual({ pair_a: "queued" });
  });
});

describe("the restart rule", () => {
  it("queued and running are the states that need review; terminal states do not", () => {
    saveJobStore({ states: { a: "queued", b: "running", c: "processed", d: "failed", e: "cancelled", f: "partial" } });
    expect(interruptedIds().sort()).toEqual(["a", "b"]);
  });

  it("an interrupted run STAYS on the review list until a deliberate retry", () => {
    saveJobStore({ states: { a: "interrupted", b: "processed" } });
    expect(interruptedIds()).toEqual(["a"]);
    // a retry that finishes is what clears it — never the restart note itself
    rememberJob("a", "processed");
    expect(interruptedIds()).toEqual([]);
  });

  it("markInterrupted flips exactly those to interrupted and says how many moved", () => {
    saveJobStore({ states: { a: "running", b: "processed", c: "queued" } });
    const { count, store } = markInterrupted();
    expect(count).toBe(2);
    expect(store.states).toEqual({ a: "interrupted", b: "processed", c: "interrupted" });
    expect(loadJobStore().states).toEqual(store.states); // and it was persisted
  });

  it("the restore note is emitted ONCE per page load — the StrictMode double-dip (T3)", () => {
    saveJobStore({ states: { a: "running", b: "queued" } });
    expect(takeRestoreNote()).toBe(2);
    expect(takeRestoreNote()).toBeNull(); // the second mount gets nothing
    expect(takeRestoreNote()).toBeNull();
  });

  it("nothing to report means no note at all, and the guard is still spent", () => {
    saveJobStore({ states: { a: "processed" } });
    expect(takeRestoreNote()).toBeNull();
    expect(takeRestoreNote()).toBeNull();
  });

  it("the store itself never writes a new job state while restoring", () => {
    saveJobStore({ states: { a: "running", b: "queued" } });
    takeRestoreNote();
    expect(loadJobStore().states).toEqual({ a: "interrupted", b: "interrupted" });
  });
});
