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
  queue: Record<string, unknown[]>;
  constructor(queue: Record<string, unknown[]>) {
    this.queue = queue;
  }
  send(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (method !== "Runtime.evaluate") return Promise.resolve({});
    const expression = String(params.expression);
    this.expressions.push(expression);
    const tail = expression.slice(expression.lastIndexOf("\n;return ("));
    const name = /\(function (\w+)/.exec(tail)?.[1] ?? "unknown";
    this.steps.push(name);
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
      settleMs: 0, bulkSaveSettleMs: 0, pollMs: 20, readyRetryMs: 0, readyTimeoutMs: 100, readyResaves: 1,
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
    expect(cdp.steps.filter((step) => step === "openFileMetadata")).toHaveLength(2);
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
