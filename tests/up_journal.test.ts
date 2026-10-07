// up_journal.test.ts — the durable attempt journal and its restart rules
// (report §5/R10). These are the acceptance rows that matter: an unfinished
// run is `interrupted` EXACTLY once, nothing is ever auto-resumed, a paid
// answer survives as a draft so recovery never asks (and never pays) twice,
// and a journal carries no key, no image and no request payload. Deleting
// lib/upjournal fails every assertion here.
import { describe, expect, it } from "vitest";
import { MANDATORY_TAGS, type IconMetadata } from "../src/lib/upmeta";
import {
  completedBy, lastStage, newJournal, parseJournal, paidStageEntered, reconcile, recoveryWarning,
  serializeJournal, settle, startRun, withAttempt, withDraft, type JobJournal,
} from "../src/lib/upjournal";

const META: IconMetadata = {
  title: "Forward Motion and Fast Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

const SOURCE = { relPath: "pairs/icon-a_AI_v1.svg", version: 1 };
const AI = {
  origin: "ai" as const, prompt: "name the icon", model: "gemini-3.1-flash-lite",
  endpointHost: "generativelanguage.googleapis.com", requestId: "req-1",
  inputTokens: 12, outputTokens: 240, estimatedCostUsd: 0.0004,
  generatedAt: "2026-10-07T09:59:00.000Z", policy: "upload-meta-v2",
};
const USER = { ...AI, origin: "user" as const, requestId: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null };
const T0 = "2026-10-07T10:00:00.000Z";
const T1 = "2026-10-07T10:00:05.000Z";

function ran(...stages: Parameters<typeof withAttempt>[1]["stage"][]): JobJournal {
  let j = newJournal("pair-1", SOURCE, T0);
  stages.forEach((stage, i) => {
    j = withAttempt(j, { stage, outcome: "started", detail: null, at: `2026-10-07T10:00:0${i}.000Z` });
  });
  return j;
}

describe("the restart rule (R10)", () => {
  it("turns an unfinished run into interrupted EXACTLY once", () => {
    const first = reconcile(ran("preflight", "prepare", "render"), T1);
    expect(first.interrupted).toBe(true);
    expect(first.journal.state).toBe("interrupted");
    expect(first.reason).toContain("Interrupted at render");
    // the second scan sees the recorded state and says nothing new
    const second = reconcile(first.journal, "2026-10-07T10:00:09.000Z");
    expect(second.interrupted).toBe(false);
    expect(second.journal).toBe(first.journal);
    expect(second.reason).toBeNull();
  });

  it("never turns a settled run into an interruption", () => {
    const done = settle(ran("preflight", "prepare", "commit"), "processed", T1);
    expect(reconcile(done, "2026-10-07T10:01:00.000Z")).toMatchObject({ interrupted: false, reason: null });
    const failed = settle(ran("preflight"), "failed", T1, "no drawable geometry");
    expect(reconcile(failed, T1).interrupted).toBe(false);
  });

  it("reads a crash AFTER the commit as finished, not interrupted", () => {
    const journal = ran("preflight", "prepare", "commit");
    expect(completedBy(journal, "2026-10-07T10:00:09.000Z")).toBe(true);
    expect(completedBy(journal, "2026-10-07T09:59:59.000Z")).toBe(false); // older than the run
    expect(completedBy(journal, null)).toBe(false);
    expect(completedBy({ ...journal, state: "interrupted" }, "2026-10-07T11:00:00.000Z")).toBe(false);
  });

  it("names the stage and the honest cost of retrying", () => {
    const plain = reconcile(ran("preflight", "prepare"), T1).journal;
    expect(lastStage(plain)).toBe("prepare");
    expect(recoveryWarning(plain)).toContain("re-export to finish");
    const paid = reconcile(withDraft(ran("preflight", "metadata"), META, AI, T0), T1).journal;
    expect(paidStageEntered(paid)).toBe(true);
    expect(recoveryWarning(paid)).toContain("does not ask the model again");
    // an unknown paid outcome must never read as a safe retry
    const unknown = reconcile(ran("preflight", "metadata"), T1).journal;
    expect(recoveryWarning(unknown)).toContain("nothing is resent automatically");
    expect(recoveryWarning(settle(plain, "cancelled", T1))).toBeNull();
  });
});

describe("the draft a paid answer leaves behind (R10/§5)", () => {
  it("is carried into the next run for the SAME source, and only that one", () => {
    const before = withDraft(ran("preflight"), META, AI, T0);
    const same = startRun(before, "pair-1", SOURCE, T1);
    expect(same.draft?.meta).toEqual(META);
    expect(same.state).toBe("running");
    expect(same.attempts).toEqual([]);
    expect(startRun(before, "pair-1", { ...SOURCE, version: 2 }, T1).draft).toBeNull();
    expect(startRun(before, "pair-2", SOURCE, T1).draft).toBeNull();
  });

  it("carries the user's accepted metadata too (never only the AI's)", () => {
    const user = withDraft(ran("preflight"), META, USER, T0);
    expect(user.draft?.provenance.origin).toBe("user");
    expect(paidStageEntered(user)).toBe(false);
    expect(parseJournal(serializeJournal(user))?.draft?.provenance.origin).toBe("user");
    // and an AI draft keeps its request id and estimated cost across the round trip
    const recovered = parseJournal(serializeJournal(withDraft(ran("preflight"), META, AI, T0)));
    expect(recovered?.draft?.provenance.requestId).toBe("req-1");
    expect(recovered?.draft?.provenance.estimatedCostUsd).toBe(0.0004);
    expect(paidStageEntered(recovered as JobJournal)).toBe(true);
  });
});

describe("the journal on disk is tolerant and private (RULE 13)", () => {
  it("round-trips what it wrote", () => {
    const j = withDraft(settle(ran("preflight", "commit"), "processed", T1), META, AI, T0);
    expect(parseJournal(serializeJournal(j))).toEqual(j);
  });

  it("refuses a payload without identity and survives a mangled tail", () => {
    expect(parseJournal("not json")).toBeNull();
    expect(parseJournal("{}")).toBeNull();
    expect(parseJournal(JSON.stringify({ v: 1, pairId: "", source: SOURCE, state: "running" }))).toBeNull();
    expect(parseJournal(JSON.stringify({ v: 1, pairId: "p", source: { relPath: "x" }, state: "running" }))).toBeNull();
    expect(parseJournal(JSON.stringify({ v: 1, pairId: "p", source: SOURCE, state: "someday" }))).toBeNull();
    const j = newJournal("p", SOURCE, T0);
    const mangle = { ...j, attempts: [{ state: "render" }, { stage: "render", outcome: "started", at: T0 }] };
    const read = parseJournal(JSON.stringify(mangle));
    expect(read?.attempts).toHaveLength(1);
    expect(read?.attempts[0].stage).toBe("render");
  });

  it("drops a draft that no longer passes the CURRENT policy", () => {
    const stale = withDraft(newJournal("p", SOURCE, T0), META, AI, T0);
    const broken = { ...stale, draft: { provenance: AI, meta: { ...META, tags: ["icon"] } } };
    expect(parseJournal(JSON.stringify(broken))?.draft).toBeNull();
  });

  it("carries no key, no image bytes and no request payload", () => {
    const text = serializeJournal(withDraft(ran("preflight", "metadata"), META, AI, T0));
    // The prompt is provenance the record itself carries; a key or a payload is not.
    for (const forbidden of ["apiKey", "AIza", "image", "base64", "contents", "inline_data", "x-goog-api-key"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});
