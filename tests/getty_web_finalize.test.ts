// The automatic tail of a Getty web run: fill each file's metadata editor from
// the accepted export.json text, save it, then complete the batch — sequenced
// through the real page steps with a recording CDP connection.

import { describe, expect, it } from "vitest";
import { finalizeBatch } from "../tools/bridge/gettyweb/contribute.mjs";
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
    fillMetadataFields: [
      { filled: { title: true, description: true, keywords: true }, present: { title: true, description: true, keywords: true } },
      { filled: { title: true, description: true, keywords: true }, present: { title: true, description: true, keywords: true } },
    ],
    saveMetadataEditor: [{ saved: true, label: "Save" }, { saved: true, label: "Save" }],
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
      complete: true,
      signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    expect(cdp.steps).toEqual([
      "openFileMetadata", "fillMetadataFields", "saveMetadataEditor", "closeMetadataEditor",
      "openFileMetadata", "fillMetadataFields", "saveMetadataEditor", "closeMetadataEditor",
      "completeBatch", "confirmCompletion", "readCompletionState",
    ]);
    expect(cdp.expressions.some((e) => e.includes("Charity hand icon"))).toBe(true);
    expect(cdp.expressions.some((e) => e.includes('"keywords":["charity","care"]'))).toBe(true);
    if (result.ok) {
      expect(result.report.metadata).toEqual([
        { name: "star_01.jpg", status: "saved", fields: { title: true, description: true, keywords: true } },
        { name: "star_01.eps", status: "saved", fields: { title: true, description: true, keywords: true } },
      ]);
      expect(result.report.completion).toEqual({ clicked: true, label: "Submit batch", confirmed: true, confirmLabel: "Submit" });
      expect(result.report.state).toEqual({ submitted: true, canComplete: false });
    }
  });

  it("does not touch the editor when a file has no accepted metadata, but still completes", async () => {
    const cdp = connection(successQueue());
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: null }], complete: true, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    expect(cdp.steps).toEqual(["completeBatch", "confirmCompletion", "readCompletionState"]);
    if (result.ok) expect(result.report.metadata).toEqual([{ name: "star_01.jpg", status: "embedded-only" }]);
  });

  it("stops before completion when the helper is told not to submit", async () => {
    const cdp = connection(successQueue());
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: false, signal: new AbortController().signal,
    });
    expect(result.ok).toBe(true);
    expect(cdp.steps).not.toContain("completeBatch");
    if (result.ok) expect(result.report.completion).toBeNull();
  });

  it("fails honestly when the batch page offers no Complete/Submit control", async () => {
    const queue = { ...successQueue(), completeBatch: [{ clicked: false, label: null }] };
    const cdp = connection(queue);
    const result = await finalizeBatch(cdp, "page-1", {
      files: [{ name: "star_01.jpg", metadata: META }], complete: true, signal: new AbortController().signal,
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
      files: [{ name: "star_01.jpg", metadata: META }], complete: true, signal: controller.signal,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("cancelled");
    expect(cdp.steps).toEqual([]);
  });
});
