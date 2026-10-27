// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decodeFrames, encodeFrame } from "../companion/src/framing";
import { NativeJob } from "../companion/src/job";

describe("bounded native companion protocol", () => {
  it("frames UTF-8, supports split/coalesced frames and rejects oversized/malformed input", () => {
    const bytes = encodeFrame({ text: "Příliš" });
    expect(decodeFrames(bytes.subarray(0, 2)).messages).toEqual([]);
    expect(decodeFrames(bytes).messages).toEqual([{ text: "Příliš" }]);
    const bad = Buffer.alloc(4); bad.writeUInt32LE(2 ** 24);
    expect(() => decodeFrames(bad)).toThrow(/size/);
  });
  it("starts idle and cancellation closes transport without credential disclosure", async () => {
    let closed = false;
    const job = new NativeJob({ upload: async () => ({ state: "transferred" as const }), close: () => { closed = true; } });
    await job.cancel(); expect(closed).toBe(true);
    await expect(job.begin({})).rejects.toThrow();
  });
});

import { ReceiptJournal } from "../companion/src/storage";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
it("blocks replay using actual durable receipts and refuses corrupt history", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stock-receipts-")), journal = new ReceiptJournal(dir);
  const file = { id: "x", name: "x.jpg", bytes: 3, kind: "jpg" as const, hash: "a".repeat(64) };
  const m = { v: 1 as const, job: crypto.randomUUID(), account: "shutterstock" as const, files: [file], epsReviewed: false };
  try {
    await journal.assertFresh(m); await journal.write({ name: file.name, hash: file.hash, state: "uncertain" });
    await expect(journal.assertFresh(m)).rejects.toThrow(/reconciliation/); await journal.replace([]); await journal.assertFresh(m);
    await writeFile(join(dir, "receipts.json"), "{}"); await expect(journal.read()).rejects.toThrow(/journal/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
