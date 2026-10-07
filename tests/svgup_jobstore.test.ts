// svgup_jobstore.test.ts — where the LAST run of each icon is remembered, and
// what a restart is allowed to do with it (design §16). The rule under test is
// the request's own: a job that was running when the app closed comes back as
// "interrupted / needs review", NEVER as an active job that quietly spends money
// again. Nothing here touches the DOM: this is the store and the one rule.
import { beforeEach, describe, expect, it } from "vitest";
import { restoreInterrupted } from "../src/svgupload/jobctl";
import {
  getJobStore, loadJobStore, parseJobStore, rememberJobs, resetJobStoreCache, setJobStore,
  UPLOAD_JOBS_KEY,
} from "../src/svgupload/jobstore";

beforeEach(() => {
  localStorage.clear();
  resetJobStoreCache();
});

describe("the job store", () => {
  it("round-trips the states through storage", () => {
    setJobStore({ states: { a: "processed", b: "failed" } });
    expect(localStorage.getItem(UPLOAD_JOBS_KEY)).toContain("processed");
    resetJobStoreCache();
    expect(loadJobStore()).toEqual({ states: { a: "processed", b: "failed" } });
  });

  it("drops junk per entry instead of losing the whole store", () => {
    // A hand-edited or half-written value: the two real states must survive.
    expect(parseJobStore({ states: { a: "queued", b: "nonsense", c: 7, d: null } }))
      .toEqual({ states: { a: "queued" } });
    expect(parseJobStore("not a store")).toEqual({ states: {} });
    expect(parseJobStore(null)).toEqual({ states: {} });
  });

  it("loads as empty when the stored text is not JSON", () => {
    localStorage.setItem(UPLOAD_JOBS_KEY, "{oops");
    expect(loadJobStore()).toEqual({ states: {} });
  });

  it("keeps one cached value until it is reset (the panel binds this)", () => {
    expect(getJobStore()).toEqual({ states: {} });
    setJobStore({ states: { a: "processed" } });
    expect(getJobStore().states.a).toBe("processed");
  });
});

describe("what a restart does with unfinished work", () => {
  it("turns running and queued into interrupted, and keeps the rest", () => {
    const restored = rememberJobs({ a: "running", b: "queued", c: "processed", d: "failed" });
    expect(restored.states).toEqual({ a: "interrupted", b: "interrupted", c: "processed", d: "failed" });
    expect(restored.note).toContain("2");
    expect(restored.states.c).toBe("processed"); // a finished package is never re-queued
  });

  it("says nothing when there was nothing unfinished", () => {
    expect(rememberJobs({ a: "processed" }).note).toBeNull();
    expect(rememberJobs({}).note).toBeNull();
  });

  it("rests on the queue's own rule rather than a second copy of it", () => {
    // Same input, same answer: the store must not re-implement the mapping.
    const previous = { x: "running", y: "cancelled" } as const;
    expect(rememberJobs(previous).states).toEqual(restoreInterrupted(previous).states);
    expect(rememberJobs(previous).note).toBe(restoreInterrupted(previous).note);
  });

  it("never re-arms a job: nothing is left running or queued after a restore", () => {
    const { states } = rememberJobs({ a: "running", b: "queued" });
    expect(Object.values(states)).not.toContain("running");
    expect(Object.values(states)).not.toContain("queued");
  });
});
