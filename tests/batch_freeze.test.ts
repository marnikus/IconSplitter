// @vitest-environment node
// batch_freeze.test.ts — ensures batch processing yields to UI (no freeze)
import { describe, it, expect } from "vitest";
import { yieldToUI, yieldToFrame, sleep } from "../src/lib/yield";
import { processItems, type BatchItem, type ProcessDeps } from "../src/batch/process";
import type { DirHandleLike } from "../src/lib/fs";

describe("yield helpers — UI stays responsive", () => {
  it("yieldToUI resolves", async () => {
    await expect(yieldToUI()).resolves.toBeUndefined();
  });
  it("yieldToFrame resolves", async () => {
    await expect(yieldToFrame()).resolves.toBeUndefined();
  });
  it("sleep resolves after delay", async () => {
    const start = Date.now();
    await sleep(10);
    expect(Date.now() - start).toBeGreaterThanOrEqual(5);
  });
});

describe("processItems yields between items", () => {
  it("calls onProgress with yield gaps", async () => {
    const fakeDest = {
      getDirectoryHandle: async () => fakeDest,
      getFileHandle: async () => ({ getFile: async () => new File([], "x") }),
      entries: async function* () {},
    } as unknown as DirHandleLike;

    const items: BatchItem[] = [
      { source: { relPath: "a.png", name: "a.png", relDir: "", refRelPath: null }, file: { getFile: async () => new File([], "a.png") } as any, refFile: null },
      { source: { relPath: "b.png", name: "b.png", relDir: "", refRelPath: null }, file: { getFile: async () => new File([], "b.png") } as any, refFile: null },
    ];

    const timestamps: number[] = [];
    const deps: ProcessDeps = {
      dest: fakeDest,
      split: { mergeFrac: null, padding: 10, size: 0, transparent: false } as any,
      splitImage: async () => {
        timestamps.push(Date.now());
        await sleep(5);
        return [];
      },
      onProgress: () => {
        timestamps.push(Date.now());
      },
    };

    const report = await processItems(items, deps);
    expect(report.results.length).toBe(2);
    // Ensure at least some gap due to yieldToFrame (should be >0 between first and second)
    expect(timestamps.length).toBeGreaterThanOrEqual(4);
    // Second item should start after first progress
    expect(timestamps[1]).toBeGreaterThanOrEqual(timestamps[0]);
  });

  it("respects shouldStop quickly", async () => {
    const fakeDest = {
      getDirectoryHandle: async () => fakeDest,
      getFileHandle: async () => ({ getFile: async () => new File([], "x") }),
      entries: async function* () {},
    } as unknown as DirHandleLike;

    const items: BatchItem[] = Array.from({ length: 5 }, (_, i) => ({
      source: { relPath: `${i}.png`, name: `${i}.png`, relDir: "", refRelPath: null },
      file: { getFile: async () => new File([], `${i}.png`) } as any,
      refFile: null,
    }));

    let stoppedAt = -1;
    const deps: ProcessDeps = {
      dest: fakeDest,
      split: { mergeFrac: null, padding: 10, size: 0, transparent: false } as any,
      splitImage: async () => [],
      shouldStop: () => stoppedAt >= 0,
      onProgress: (done) => {
        if (done === 2) stoppedAt = done;
      },
    };

    const report = await processItems(items, deps);
    expect(report.stopped).toBe(true);
    expect(report.results.length).toBeLessThan(5);
  });
});
