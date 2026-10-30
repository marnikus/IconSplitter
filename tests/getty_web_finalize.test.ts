// @vitest-environment node
// The automatic tail of a Getty web run: fill each file's metadata editor from
// the accepted export.json text, save it, then complete the batch — sequenced
// through the real page steps with a recording CDP connection.

import { describe, expect, it, vi } from "vitest";
import { finalizeBatch, gettyCreatedDate } from "../tools/bridge/gettyweb/contribute.mjs";
import { gettyWebCreatedDate } from "../src/lib/stockupload/gettyweb";
import type { CdpConnection } from "../tools/bridge/gettyweb/cdp.mjs";

const META = { title: "Charity hand icon", description: "Open palm holding a heart.", keywords: ["charity", "care"] };

class FakeConnection {
  steps: string[] = [];
  expressions: string[] = [];
  /** Every CDP method, so a page reload is visible next to the page steps. */
  calls: string[] = [];
  /** Methods and page steps in the order they happened, for the ladder's order. */
  timeline: string[] = [];
  queue: Record<string, unknown[]>;
  constructor(queue: Record<string, unknown[]>) {
    this.queue = queue;
  }
  send(method: string, params: Record<string, unknown>): Promise<unknown> {
    this.calls.push(method);
    if (method !== "Runtime.evaluate") {
      this.timeline.push(method);
      return Promise.resolve({});
    }
    const expression = String(params.expression);
    // A reloaded page is usable again: that is what the helper waits for.
    if (expression.includes("document.readyState")) return Promise.resolve({ result: { value: true } });
    this.expressions.push(expression);
    const tail = expression.slice(expression.lastIndexOf("\n;return ("));
    const name = /\(function (\w+)/.exec(tail)?.[1] ?? "unknown";
    this.steps.push(name);
    this.timeline.push(name);
    const value = this.queue[name]?.shift() ?? null;
    return Promise.resolve({ result: { value } });
  }
}

const connection = (queue: Record<string, unknown[]>) => new FakeConnection(queue) as unknown as CdpConnection & FakeConnection;

function successQueue(): Record<string, unknown[]> {
  return {
    openFileMetadata: [{ opened: true, method: "button", label: "Edit metadata" }, { opened: true, method: "button", label: "Edit metadata" }],
    metadataEditorReady: [
      { ready: true, present: true }, { ready: true, present: true }, { ready: true, present: true },
      { ready: true, present: true }, { ready: true, present: true },
    ],
    fillMetadataFields: [
      { filled: { title: true, description: true, keywords: true }, present: { title: true, description: true, keywords: true } },
      { filled: { title: true, description: true, keywords: true }, present: { title: true, description: true, keywords: true } },
    ],
    saveMetadataEditor: [
      { saved: true, label: "Save" }, { saved: true, label: "Save" }, { saved: true, label: "Save metadata" },
    ],
    selectAllContributions: [{ selected: 2, method: "select-all" }, { selected: 1, method: "ctrl-click" }],
    closeMetadataEditor: [{ closed: true, label: "Close" }, { closed: true, label: "Close" }],
    completeBatch: [{ clicked: true, label: "Submit batch" }],
    confirmCompletion: [{ confirmed: true, label: "Submit", dialog: true }],
    readCompletionState: [{ submitted: true, canComplete: false }],
  };
}

describe("Getty web automatic finalize", () => {
  it("fills both files' metadata, saves, then completes and confirms the batch", async () => {
    const cdp = connection(successQueue());
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }, { name: "star_01.eps", metadata: META }],
      complete: true, settleMs: 0, bulkSaveSettleMs: 0,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    // star_01.jpg and star_01.eps are one contribution, so one drawer, not two.
    expect(cdp.steps).toEqual([
      "openFileMetadata", "metadataEditorReady", "fillMetadataFields", "saveMetadataEditor", "closeMetadataEditor",
      "selectAllContributions", "saveMetadataEditor",
      // Readiness is read from the cards' own validation icons before clicking.
      "readUploadState",
      "completeBatch", "confirmCompletion", "readCompletionState",
    ]);
    expect(cdp.expressions.some((e) => e.includes("Charity hand icon"))).toBe(true);
    expect(cdp.expressions.some((e) => e.includes('"keywords":["charity","care"]'))).toBe(true);
    if (result.ok) {
      expect(result.report.metadata).toEqual([
        { name: "star_01.jpg", status: "saved", fields: { title: true, description: true, keywords: true } },
        { name: "star_01.eps", status: "same-contribution" },
      ]);
      expect(result.report.completion).toEqual({ clicked: true, label: "Submit batch", confirmed: true, confirmLabel: "Submit" });
      expect(result.report.state).toEqual({ submitted: true, canComplete: false });
    }
  });

  it("fills today's Date Created and one drawer per contribution across different icons", async () => {
    const cdp = connection(successQueue());
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }, { name: "moon_02.jpg", metadata: META }],
      complete: true, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    expect(cdp.steps.filter((step) => step === "openFileMetadata")).toHaveLength(2);
    const filled = cdp.expressions.filter((expression) => expression.includes("fillMetadataFields"));
    const today = gettyCreatedDate();
    expect(filled).toHaveLength(2);
    // Getty's drawer shows "MM/DD/YYYY 00:00:00 +0000", not an ISO date.
    expect(filled.every((expression) => expression.includes(`"dateCreated":"${today}"`))).toBe(true);
    expect(filled[0]).toMatch(/"dateCreated":"\d{2}\/\d{2}\/\d{4} 00:00:00 \+0000"/);
  });

  it("selects every file once its Date Created is in and applies Save metadata to all of them", async () => {
    const cdp = connection(successQueue());
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }, { name: "moon_02.jpg", metadata: META }],
      complete: false, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    const steps = cdp.steps.filter((step) => step !== "metadataEditorReady");
    // Every drawer is saved as it is filled, then the whole selection is saved once.
    expect(steps).toEqual([
      "openFileMetadata", "fillMetadataFields", "saveMetadataEditor", "closeMetadataEditor",
      "openFileMetadata", "fillMetadataFields", "saveMetadataEditor", "closeMetadataEditor",
      "selectAllContributions", "saveMetadataEditor", "readUploadState",
    ]);
    if (result.ok) {
      expect(result.report.bulkSave).toEqual({ selected: 2, method: "select-all", saved: true, label: "Save metadata" });
      // The bulk pass must not touch the tag count of any file.
      expect(result.report.metadata.every((entry: { keywords?: unknown }) => entry.keywords === undefined)).toBe(true);
    }
  });

  it("reports a bulk save that found nothing to select without claiming it saved", async () => {
    const queue = { ...successQueue(), selectAllContributions: [{ selected: 0, method: "none" }] };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: false, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(cdp.steps.filter((step) => step === "saveMetadataEditor")).toHaveLength(1);
    if (result.ok) expect(result.report.bulkSave).toEqual({ selected: 0, method: "none", saved: false, label: null });
  });

  it("keeps Getty's real settle windows unless a caller injects faster ones", async () => {
    // The knobs exist so tests do not sleep; production must still wait for Getty.
    vi.useFakeTimers();
    try {
      const cdp = connection(successQueue());
      const pending = finalizeBatch(cdp, "page-1", {
        files: [{ name: "star_01.jpg", metadata: META }], complete: true,
        signal: new AbortController().signal,
      });
      await vi.advanceTimersByTimeAsync(1200);
      // The grid-wide save's own 1.5 s window has not elapsed yet.
      expect(cdp.steps).not.toContain("completeBatch");
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(2000);
      expect((await pending).ok).toBe(true);
      expect(cdp.steps).toContain("selectAllContributions");
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves the metadata again when a card is not Ready to submit, then finishes", async () => {
    // Getty validates a card after its metadata is saved; a card that still shows
    // the not-ready icon gets the grid-wide save pressed again, and only then is
    // the batch complete. That second save is what flips the icon.
    const queue = {
      ...successQueue(),
      selectAllContributions: [{ selected: 1, method: "select-all" }, { selected: 1, method: "select-all" }],
      saveMetadataEditor: [
        { saved: true, label: "Save" }, { saved: true, label: "Save metadata" }, { saved: true, label: "Save metadata" },
      ],
      readUploadState: [
        { cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] },
        { cardsPresent: true, readyToSubmit: ["star_01.jpg"], awaitingReady: [] },
      ],
    };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true,
      settleMs: 0, bulkSaveSettleMs: 0, pollMs: 0, readyRetryMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    expect(cdp.steps.filter((step) => step === "selectAllContributions")).toHaveLength(2);
    expect(cdp.steps.filter((step) => step === "saveMetadataEditor")).toHaveLength(3);
    if (result.ok) {
      expect(result.report.readiness).toMatchObject({ ok: true, verified: true, notReady: [], resaves: 1 });
      expect(result.report.completion).toMatchObject({ clicked: true });
    }
  });

  it("refuses to claim a batch finished while a card never shows Ready to submit", async () => {
    const queue = {
      ...successQueue(),
      readUploadState: [{ cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] }],
    };
    const cdp = connection(queue);
    const progress: string[] = [];
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true,
      settleMs: 0, bulkSaveSettleMs: 0, pollMs: 20, readyRetryMs: 0, readyTimeoutMs: 100, readyResaves: 1, readyReloads: 0,
      onProgress: (line: string) => progress.push(line), signal: new AbortController().signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("timeout");
      expect(result.reason).toContain("Ready to submit");
      expect(result.reason).toContain("star_01");
      expect(result.report.readiness).toMatchObject({ ok: false, notReady: ["star_01"], resaves: 1 });
    }
    // An unvalidated file is never submitted, and the re-save was actually tried.
    expect(cdp.steps).not.toContain("completeBatch");
    expect(cdp.steps.filter((step) => step === "selectAllContributions")).toHaveLength(2);
    expect(progress.some((line) => /not ready to submit/.test(line))).toBe(true);
  });

  it("presses Save metadata again when the grid save left a card not ready", async () => {
    // Getty flips a card to "Ready to submit" only once its metadata is saved
    // again. The run must re-save after the retry window and re-check the card —
    // and it must not click Complete before that card is ready.
    const queue = {
      ...successQueue(),
      selectAllContributions: [{ selected: 1, method: "select-all" }, { selected: 1, method: "select-all" }],
      saveMetadataEditor: [
        { saved: true, label: "Save" }, { saved: true, label: "Save metadata" }, { saved: true, label: "Save metadata" },
      ],
      readUploadState: [
        { cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] },
        { cardsPresent: true, readyToSubmit: ["star_01.jpg"], awaitingReady: [] },
      ],
      completeBatch: [{ clicked: true, label: "Submit batch" }],
      confirmCompletion: [{ confirmed: true, label: "Submit", dialog: true }],
      readCompletionState: [{ submitted: true, canComplete: false }],
    };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true,
      settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1, readyRetryMs: 0,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    // Two grid-wide saves: the bulk one and the retry that flipped the card.
    expect(cdp.steps.filter((step) => step === "selectAllContributions")).toHaveLength(2);
    const reselect = cdp.steps.lastIndexOf("readUploadState");
    expect(cdp.steps.slice(reselect)).toContain("completeBatch");
    if (result.ok) expect(result.report.readiness).toMatchObject({ ok: true, notReady: [], resaves: 1 });
  });

  it("never clicks Complete while a card still lacks its Ready to submit chip", async () => {
    const queue = {
      ...successQueue(),
      readUploadState: [{ cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] }],
    };
    const cdp = connection(queue);
    const progress: string[] = [];
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true,
      settleMs: 0, bulkSaveSettleMs: 0, pollMs: 5, readyRetryMs: 0, readyTimeoutMs: 40, readyResaves: 1,
      onProgress: (line: string) => progress.push(line), signal: new AbortController().signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("timeout");
      expect(result.reason).toContain("Ready to submit");
      expect(result.reason).toContain("star_01");
    }
    expect(cdp.steps).not.toContain("completeBatch");
    expect(progress.some((line) => /saving the metadata again/.test(line))).toBe(true);
  });

  it("keeps the engine and the helper's Date Created identical", () => {
    // The panel formats dates in src/lib; the helper does it in plain ESM, so a
    // test pins both to Getty's own rendering.
    const now = new Date("2026-10-30T09:15:00Z");
    expect(gettyCreatedDate(now)).toBe(gettyWebCreatedDate(now));
    expect(gettyCreatedDate(now)).toBe("10/30/2026 00:00:00 +0000");
  });

  it("lets an accepted date override today's Date Created", async () => {
    const cdp = connection(successQueue());
    await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: { ...META, dateCreated: "01/31/2025 00:00:00 +0000" } }],
      complete: false, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(cdp.expressions.some((expression) => expression.includes('"dateCreated":"01/31/2025 00:00:00 +0000"'))).toBe(true);
  });

  it("waits for the clicked card's drawer to unlock before typing, then saves it", async () => {
    const queue = successQueue();
    // The drawer stays disabled for two polls, the way it does while Getty loads it.
    queue.metadataEditorReady = [{ ready: false, present: true }, { ready: false, present: true }, { ready: true, present: true }];
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: false, settleMs: 0, bulkSaveSettleMs: 0,
      editorPollMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    const steps = cdp.steps.filter((step) => step !== "metadataEditorReady");
    expect(steps).toEqual([
      "openFileMetadata", "fillMetadataFields", "saveMetadataEditor", "closeMetadataEditor",
      "selectAllContributions", "saveMetadataEditor", "readUploadState",
    ]);
    expect(cdp.steps.filter((step) => step === "metadataEditorReady")).toHaveLength(3);
    if (result.ok) expect(result.report.metadata).toEqual([
      { name: "star_01.jpg", status: "saved", fields: { title: true, description: true, keywords: true } },
    ]);
  });

  it("waits for a still-locked drawer before typing so the file flips to ready to upload", async () => {
    const queue = successQueue();
    // Getty enables the drawer a moment after the card click.
    queue.metadataEditorReady = [{ ready: false, present: true }, { ready: true, present: true }];
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: false, settleMs: 0, bulkSaveSettleMs: 0,
      editorPollMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    const steps = cdp.steps.filter((step) => step !== "metadataEditorReady");
    expect(steps).toEqual([
      "openFileMetadata", "fillMetadataFields", "saveMetadataEditor", "closeMetadataEditor",
      "selectAllContributions", "saveMetadataEditor", "readUploadState",
    ]);
    if (result.ok) expect(result.report.metadata).toEqual([
      { name: "star_01.jpg", status: "saved", fields: { title: true, description: true, keywords: true } },
    ]);
  });

  it("re-clicks a card whose drawer never unlocks and types nothing into it", async () => {
    const queue = {
      ...successQueue(),
      openFileMetadata: [
        { opened: true, method: "card", label: "star_01.jpg" }, { opened: true, method: "card", label: "star_01.jpg" },
      ],
      metadataEditorReady: [{ ready: false, present: true }, { ready: false, present: true }],
    };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: false, settleMs: 0, bulkSaveSettleMs: 0,
      editorPollMs: 0, editorTimeoutMs: 0, signal: new AbortController().signal,
    });
    // Two clicks in the first walk, then the repair walk reopens the page and
    // tries the file again — it never types into a drawer Getty keeps locked.
    expect(cdp.steps.filter((step) => step === "openFileMetadata")).toHaveLength(3);
    expect(cdp.calls).toContain("Page.reload");
    expect(cdp.steps).not.toContain("fillMetadataFields");
    if (result.ok) {
      expect(result.report.metadata).toEqual([{ name: "star_01.jpg", status: "editor-not-ready" }]);
      // Nothing was saved, so no bulk save is claimed either.
      expect(result.report.bulkSave).toBeNull();
    }
  });

  it("reports a drawer that never unlocks instead of claiming the file is ready", async () => {
    // Both clicks land on a drawer Getty keeps disabled.
    const queue = { ...successQueue(), metadataEditorReady: [{ ready: false, present: true }, { ready: false, present: true }] };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: false, settleMs: 0, bulkSaveSettleMs: 0,
      editorTimeoutMs: 0, editorPollMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    expect(cdp.steps).not.toContain("fillMetadataFields");
    if (result.ok) expect(result.report.metadata).toEqual([{ name: "star_01.jpg", status: "editor-not-ready" }]);
  });

  it("does not touch the editor when a file has no accepted metadata, but still completes", async () => {
    const cdp = connection(successQueue());
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: null }], complete: true, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    expect(cdp.steps).toEqual(["readUploadState", "completeBatch", "confirmCompletion", "readCompletionState"]);
    if (result.ok) expect(result.report.metadata).toEqual([{ name: "star_01.jpg", status: "embedded-only" }]);
  });

  it("names the file when a fill ever changes its number of tags", async () => {
    const queue = successQueue();
    queue.fillMetadataFields = [{
      filled: { title: true, description: true, keywords: false },
      present: { title: true, description: true, keywords: true }, keywordsBefore: 5, keywordsAfter: 7,
    }];
    const progress: string[] = [];
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: false, settleMs: 0, bulkSaveSettleMs: 0,
      onProgress: (line: string) => progress.push(line), signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.metadata[0]).toMatchObject({ keywords: { before: 5, after: 7 } });
    expect(progress.some((line) => /keywords 5 → 7/.test(line))).toBe(true);
  });

  it("keeps a fill that left the tags alone free of any tag note", async () => {
    const queue = successQueue();
    queue.fillMetadataFields = [{
      filled: { title: true, description: true, keywords: false },
      present: { title: true, description: true, keywords: true }, keywordsBefore: 5, keywordsAfter: 5,
    }];
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: false, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.metadata[0]).not.toHaveProperty("keywords");
  });

  it("re-uploads a rejected card instead of giving up on the batch", async () => {
    // The user's batch had one "Upload failed" card and one card stuck on
    // not_ready_to_submit; both must go back to the uploader, not be reported as
    // finished and not end the run on the spot.
    const queue = {
      ...successQueue(),
      // After the re-upload the card is validated: the reading says so.
      readUploadState: [{ cardsPresent: true, readyToSubmit: ["star_01.jpg", "broken_02.jpg"], awaitingReady: [], failed: [] }],
    };
    const cdp = connection(queue);
    const repaired: string[][] = [];
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }, { name: "broken_02.jpg", metadata: META }],
      failed: ["broken_02.jpg"], complete: true, settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1,
      repair: async (names: string[]) => { repaired.push(names); return { ok: true }; },
      signal: new AbortController().signal,
    });
    expect(repaired).toEqual([["broken_02.jpg"]]);
    expect(result.ok).toBe(true);
    expect(cdp.steps).toContain("completeBatch");
    if (result.ok) expect(result.report.readiness).toMatchObject({ ok: true, notReady: [] });
  });

  it("keeps refusing when the re-uploaded card stays Upload failed", async () => {
    const queue = {
      ...successQueue(),
      readUploadState: [{ cardsPresent: true, readyToSubmit: [], awaitingReady: [], failed: ["broken_02.jpg"] }],
    };
    const cdp = connection(queue);
    let repairs = 0;
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "broken_02.jpg", metadata: META }],
      failed: ["broken_02.jpg"], complete: true, settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1,
      repair: async () => { repairs += 1; return { ok: true }; },
      signal: new AbortController().signal,
    });
    expect(repairs).toBe(1);
    expect(result).toMatchObject({ ok: false, code: "page" });
    if (!result.ok) expect(result.reason).toContain("Upload failed");
    expect(cdp.steps).not.toContain("completeBatch");
  });

  it("reloads the batch page when a card stays not ready through both re-saves", async () => {
    // Getty stops re-reading its own validation until the page is loaded again:
    // the reload is the recovery that turns the card, and it must happen before
    // the run gives up on the file.
    const notReady = { cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] };
    const queue = {
      ...successQueue(),
      // The reloaded page is walked again: its drawer is reopened and re-filled
      // before the grid is saved, so the file gets its timestamp back.
      openFileMetadata: [
        { opened: true, method: "card" }, { opened: true, method: "card" }, { opened: true, method: "card" },
      ],
      metadataEditorReady: Array.from({ length: 3 }, () => ({ ready: true, present: true })),
      fillMetadataFields: Array.from({ length: 3 }, () => ({
        filled: { title: true, description: true, keywords: false, dateCreated: true }, present: { title: true, dateCreated: true },
      })),
      selectAllContributions: Array.from({ length: 8 }, () => ({ selected: 1, method: "select-all" })),
      saveMetadataEditor: Array.from({ length: 10 }, () => ({ saved: true, label: "Save metadata" })),
      readUploadState: [notReady, notReady, notReady, notReady, { cardsPresent: true, readyToSubmit: ["star_01.jpg"], awaitingReady: [] }],
    };
    const cdp = connection(queue);
    const notes: string[] = [];
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true,
      state: { cardsPresent: true, withThumbnail: ["star_01.eps"], readyToSubmit: [], awaitingReady: ["star_01.jpg"] },
      settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1, readyRetryMs: 0, readyTimeoutMs: 60000,
      onProgress: (line: string) => notes.push(line),
      signal: new AbortController().signal,
    });
    expect(cdp.calls).toContain("Page.reload");
    expect(notes.some((line) => /reload/i.test(line))).toBe(true);
    // The reload is followed by walking the batch from its first file again: the
    // drawer is reopened and the date re-typed, then the grid is saved. A fresh
    // page only re-validates a card whose metadata it was given.
    const afterReload = cdp.timeline.slice(cdp.timeline.indexOf("Page.reload"));
    expect(afterReload).toContain("openFileMetadata");
    expect(afterReload).toContain("fillMetadataFields");
    expect(afterReload).toContain("selectAllContributions");
    expect(afterReload).toContain("saveMetadataEditor");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.readiness).toMatchObject({ ok: true, notReady: [], resaves: 2 });
  });

  it("always reloads a stuck batch page at least once before giving up on it", async () => {
    // The per-batch guarantee: a batch whose cards never turn gets its page
    // reloaded even when no re-save or re-upload is left in the plan, and only
    // then is it reported — never silently handed to the next 100-icon batch.
    const notReady = { cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] };
    const queue = {
      ...successQueue(),
      selectAllContributions: Array.from({ length: 8 }, () => ({ selected: 1, method: "select-all" })),
      saveMetadataEditor: Array.from({ length: 8 }, () => ({ saved: true, label: "Save metadata" })),
      readUploadState: [notReady],
    };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true,
      settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1, readyRetryMs: 0,
      readyTimeoutMs: 40, readyResaves: 0, readyRepairs: 0,
      signal: new AbortController().signal,
    });
    expect(cdp.calls.filter((call) => call === "Page.reload").length).toBeGreaterThanOrEqual(1);
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    if (!result.ok) expect(result.report.readiness).toMatchObject({ ok: false, resaves: 0, repairs: 0, notReady: ["star_01"] });
    expect(cdp.steps).not.toContain("completeBatch");
  });

  it("re-uploads a card that never turns Ready to submit, then finishes", async () => {
    const queue = {
      ...successQueue(),
      selectAllContributions: Array.from({ length: 8 }, () => ({ selected: 1, method: "select-all" })),
      saveMetadataEditor: Array.from({ length: 8 }, () => ({ saved: true, label: "Save metadata" })),
      // Two re-saves and two page reloads change nothing; the card only validates
      // after the re-upload, which is exactly the ladder's last step.
      readUploadState: [
        { cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] },
        { cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] },
        { cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] },
        { cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] },
        { cardsPresent: true, readyToSubmit: [], awaitingReady: ["star_01.jpg"] },
        { cardsPresent: true, readyToSubmit: ["star_01.jpg"], awaitingReady: [] },
      ],
    };
    const cdp = connection(queue);
    const repaired: string[][] = [];
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true,
      settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1, readyRetryMs: 0, readyTimeoutMs: 60000,
      repair: async (names: string[]) => { repaired.push(names); return { ok: true }; },
      signal: new AbortController().signal,
    });
    // The re-saves come first, then the file itself is sent back to Getty.
    expect(repaired).toEqual([["star_01"]]);
    expect(cdp.steps.filter((step: string) => step === "selectAllContributions").length).toBeGreaterThan(2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.readiness).toMatchObject({ ok: true, resaves: 2, repairs: 1 });
  });

  it("refuses to submit while Getty reports an Upload failed card", async () => {
    const cdp = connection(successQueue());
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], failed: ["broken_02.jpg"],
      complete: true, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(result).toMatchObject({ ok: false, code: "page" });
    if (!result.ok) expect(result.reason).toContain("Upload failed");
    expect(cdp.steps).not.toContain("completeBatch");
  });

  it("never submits the batch while Getty reports an Upload failed file", async () => {
    const cdp = connection(successQueue());
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }, { name: "moon_02.jpg", metadata: null }],
      failed: ["moon_02.jpg"], complete: true, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Upload failed/);
    // A failed card would be locked out by submitting, so Complete is never clicked.
    expect(cdp.steps).not.toContain("completeBatch");
    if (result.report) expect(result.report.metadata).toContainEqual({ name: "moon_02.jpg", status: "upload-failed" });
  });

  it("stops before completion when the helper is told not to submit", async () => {
    const cdp = connection(successQueue());
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: false, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    expect(cdp.steps).not.toContain("completeBatch");
    if (result.ok) expect(result.report.completion).toBeNull();
  });

  it("fails honestly when the batch page offers no Complete/Submit control", async () => {
    const queue = { ...successQueue(), completeBatch: [{ clicked: false, label: null }] };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true, settleMs: 0, bulkSaveSettleMs: 0, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("page");
      expect(result.reason).toContain("Complete/Submit");
    }
    expect(cdp.steps).not.toContain("confirmCompletion");
  });

  it("cancels between files without completing the batch", async () => {
    const cdp = connection(successQueue());
    const controller = new AbortController();
    controller.abort();
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true, settleMs: 0, bulkSaveSettleMs: 0, signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("cancelled");
    expect(cdp.steps).toEqual([]);
  });
});

describe("Getty metadata repair sweep (timestamp + metadata applied to every file)", () => {
  const DATE = gettyCreatedDate();
  const state = (extra: Record<string, unknown>) => ({
    cardsPresent: true, readyToSubmit: [], awaitingReady: [], failed: [],
    withThumbnail: ["star_01.eps", "moon_02.eps"], ...extra,
  });

  it("reloads the page at once when a drawer only shows skeletons, then walks every file from the first", async () => {
    // The reported failure: the drawer paints its MUI skeletons and never unlocks.
    // Waiting it out and moving to the next file leaves this one without its
    // timestamp; the page has to be reloaded and the batch walked from file 0.
    const queue = {
      ...successQueue(),
      openFileMetadata: [
        { opened: true, method: "card", label: "star_01.eps" },
        { opened: true, method: "card", label: "star_01.eps" },
        { opened: true, method: "card", label: "moon_02.eps" },
      ],
      metadataEditorReady: [
        { ready: false, present: false, skeleton: true },
        { ready: true, present: true }, { ready: true, present: true },
      ],
      fillMetadataFields: [
        { filled: { title: true, description: true, keywords: false, dateCreated: true }, present: { title: true, description: true, keywords: true, dateCreated: true }, values: { dateCreated: DATE } },
        { filled: { title: true, description: true, keywords: false, dateCreated: true }, present: { title: true, description: true, keywords: true, dateCreated: true }, values: { dateCreated: DATE } },
      ],
      selectAllContributions: [{ selected: 2, method: "select-all" }],
      saveMetadataEditor: Array.from({ length: 6 }, () => ({ saved: true, label: "Save metadata" })),
      readUploadState: [{ cardsPresent: true, readyToSubmit: ["star_01.jpg", "moon_02.jpg"], awaitingReady: [] }],
    };
    const cdp = connection(queue);
    const notes: string[] = [];
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }, { name: "moon_02.jpg", metadata: META }],
      state: state({}), complete: true, settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1,
      editorPollMs: 0, skeletonTimeoutMs: 0, onProgress: (line: string) => notes.push(line),
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    // The page was reloaded before the second file was ever touched.
    const reloadAt = cdp.timeline.lastIndexOf("Page.reload");
    expect(reloadAt).toBeGreaterThanOrEqual(0);
    const firstFill = cdp.expressions.findIndex((expression) => expression.includes("fillMetadataFields"));
    const starAt = cdp.expressions.findIndex((expression) => expression.includes("star_01"));
    const moonAt = cdp.expressions.findIndex((expression) => expression.includes("moon_02"));
    expect(starAt).toBeGreaterThanOrEqual(0);
    expect(firstFill).toBeLessThan(moonAt);
    // Both files of the batch got their Date Created after the reload.
    const dates = cdp.expressions.filter((expression) => expression.includes("fillMetadataFields"));
    expect(dates.length).toBeGreaterThanOrEqual(2);
    expect(notes.some((line) => /skeleton|from the beginning/i.test(line))).toBe(true);
    if (result.ok) {
      expect(result.report.metadata).toEqual([
        expect.objectContaining({ name: "star_01.jpg", status: "saved" }),
        expect.objectContaining({ name: "moon_02.jpg", status: "saved" }),
      ]);
      expect(result.report.sweeps).toBe(1);
    }
  });

  it("detects a Date Created that did not take and repairs it from the first file", async () => {
    const queue = {
      ...successQueue(),
      openFileMetadata: [
        { opened: true, method: "card", label: "star_01.eps" },
        { opened: true, method: "card", label: "star_01.eps" },
      ],
      metadataEditorReady: [{ ready: true, present: true }, { ready: true, present: true }],
      fillMetadataFields: [
        // Getty dropped the typed date: the drawer reads back empty.
        { filled: { title: true, description: true, keywords: false, dateCreated: true }, present: { title: true, description: true, keywords: true, dateCreated: true }, values: { dateCreated: "" } },
        { filled: { title: true, description: true, keywords: false, dateCreated: true }, present: { title: true, description: true, keywords: true, dateCreated: true }, values: { dateCreated: DATE } },
      ],
      selectAllContributions: [{ selected: 1, method: "select-all" }],
      saveMetadataEditor: Array.from({ length: 6 }, () => ({ saved: true, label: "Save metadata" })),
      readUploadState: [{ cardsPresent: true, readyToSubmit: ["star_01.jpg"], awaitingReady: [] }],
    };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }],
      state: state({ withThumbnail: ["star_01.eps"] }), complete: true, settleMs: 0, bulkSaveSettleMs: 0, pollMs: 1,
      editorPollMs: 0, onProgress: () => undefined, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    expect(cdp.calls).toContain("Page.reload");
    const fills = cdp.expressions.filter((expression) => expression.includes("fillMetadataFields"));
    expect(fills).toHaveLength(2);
    expect(fills[1]).toContain(DATE);
    if (result.ok) expect(result.report.metadata).toEqual([expect.objectContaining({ name: "star_01.jpg", status: "saved" })]);
  });

  it("skips only the contributions without a picture, whatever the run sent", async () => {
    const queue = {
      ...successQueue(),
      openFileMetadata: [
        { opened: true, method: "card", label: "moon_02.eps" },
        { opened: true, method: "card", label: "moon_02.eps" },
      ],
      metadataEditorReady: [
        { ready: false, present: false, skeleton: true },
        { ready: true, present: true },
      ],
      fillMetadataFields: [{
        filled: { title: true, description: true, keywords: false, dateCreated: true },
        present: { title: true, description: true, keywords: true, dateCreated: true }, values: { dateCreated: DATE },
      }],
      readUploadState: [{ cardsPresent: true, readyToSubmit: ["star_01.jpg", "moon_02.jpg"], awaitingReady: [] }],
    };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }, { name: "moon_02.jpg", metadata: META }],
      // star_01 arrived without a picture: there is no drawer to open for it.
      state: state({ withThumbnail: ["moon_02.eps"] }), complete: false, settleMs: 0, bulkSaveSettleMs: 0,
      pollMs: 1, editorPollMs: 0, skeletonTimeoutMs: 0, onProgress: () => undefined,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    // Only the file with a picture was ever opened — the picture-less one is skipped.
    const opened = cdp.expressions.filter((expression) => expression.includes("openFileMetadata"));
    expect(opened).toHaveLength(2);
    expect(opened.every((expression) => expression.includes("moon_02"))).toBe(true);
    if (result.ok) {
      expect(result.report.metadata.map((entry: { name: string }) => entry.name)).toContain("moon_02.jpg");
      expect(result.report.metadata.map((entry: { name: string }) => entry.name)).not.toContain("star_01.jpg");
    }
  });
});
