// @vitest-environment node
// Getty's batch arithmetic, without a browser: the 100-upload cap is counted in
// ICONS (a JPEG + EPS pair is one upload), so a bigger selection becomes several
// batches, the pair is never split, and "the first 100 pairs" means something.

import { describe, expect, it } from "vitest";
import {
  GETTY_WEB_MAX_ATTEMPTS, GETTY_WEB_MAX_BATCH_BYTES, GETTY_WEB_MAX_BATCH_ICONS, gettyWebBatchLabel,
  gettyWebBatchName, gettyWebBatchSummary, gettyWebBatchSummaryOf, gettyWebRequestBytes,
  planGettyWebBatches, randomBatchOrder, similarityKeyOf, spreadSimilar,
} from "../src/lib/stockupload/gettyweb";

const icons = (n: number) => Array.from({ length: n }, (_v, i) => ({ id: `icon-${i}` }));

describe("Getty web batch planning", () => {
  it("takes 100 uploads per batch — the icon is the unit, not the file", () => {
    // 250 pairs are 250 uploads and up to 500 physical files.
    expect(planGettyWebBatches(icons(250)).map((batch) => batch.length)).toEqual([100, 100, 50]);
    // A JPEG-only icon still costs one of the 100: 150 icons are 2 batches.
    expect(planGettyWebBatches(icons(150)).map((batch) => batch.length)).toEqual([100, 50]);
  });

  it("never puts 101 icons in one batch and keeps the plan's order", () => {
    const source = icons(101);
    const chunks = planGettyWebBatches(source);
    expect(chunks.map((batch) => batch.length)).toEqual([100, 1]);
    expect(chunks[0][0]).toBe(source[0]);
    expect(chunks[1][0]).toBe(source[100]);
  });

  it("keeps a pair together: one icon is always whole inside one batch", () => {
    // The pair is the icon, so no chunk boundary can fall between its two files.
    const chunks = planGettyWebBatches(icons(7), 3);
    expect(chunks.map((batch) => batch.length)).toEqual([3, 3, 1]);
    expect(chunks.flat().map((icon) => icon.id)).toEqual(icons(7).map((icon) => icon.id));
  });

  it("sends nothing for an empty selection and accepts an injected cap", () => {
    expect(planGettyWebBatches([])).toEqual([]);
    expect(planGettyWebBatches(icons(5), 2).map((batch) => batch.length)).toEqual([2, 2, 1]);
    // A nonsensical cap can never produce an empty batch or a loop.
    expect(planGettyWebBatches(icons(3), 0).map((batch) => batch.length)).toEqual([1, 1, 1]);
  });

  it("names each batch with its place in the run, inside Getty's 60 characters", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    // The app's name is not part of Getty's batch name: date, place and size only.
    expect(gettyWebBatchName(now, 2, { index: 1, total: 1 })).toBe("2026-10-30 (2 icons)");
    expect(gettyWebBatchName(now, 100, { index: 2, total: 3 })).toBe("2026-10-30 2/3 (100 icons)");
    expect(gettyWebBatchName(now, 7, { index: 1, total: 1, retry: true }))
      .toBe("2026-10-30 retry 1/1 (7 icons)");
    expect(gettyWebBatchName(now, 100, { index: 3, total: 3 }).length).toBeLessThanOrEqual(60);
  });

  it("groups icons that only differ by a trailing number, so they can be kept apart", () => {
    expect(similarityKeyOf("icon-snowflake_2_01.jpg")).toBe("icon-snowflake_2");
    expect(similarityKeyOf("ICON-06.eps")).toBe("icon");
    expect(similarityKeyOf("star.eps")).toBe("star");
  });

  it("never leaves two icons of the same picture side by side when it can help it", () => {
    // The batch was drawn at random, but a draw can still put both sizes of one
    // picture next to each other; the dealer moves one of them away.
    const batch = ["snow_01", "snow_02", "wheel_01", "wheel_02"];
    expect(spreadSimilar(batch, similarityKeyOf)).toEqual(["snow_01", "wheel_01", "snow_02", "wheel_02"]);
    // Same members, only the order changes — nothing is dropped or added.
    expect([...spreadSimilar(batch, similarityKeyOf)].sort()).toEqual([...batch].sort());
    // A batch of one picture only cannot be spread: the run keeps it as it is.
    expect(spreadSimilar(["a_01", "a_02"], similarityKeyOf)).toEqual(["a_01", "a_02"]);
  });

  it("can order the whole selection at random, so every batch is a random draw", () => {
    // Random batch selection: a shuffle of every icon, then the usual 100-icon
    // chunking — so batch 1 is not simply the first 100 rows of the list.
    const rng = () => 0;
    const order = randomBatchOrder(5, rng);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(order).not.toEqual([0, 1, 2, 3, 4]);
    // The same icons, every one of them exactly once.
    expect(randomBatchOrder(0, rng)).toEqual([]);
    expect(randomBatchOrder(3, () => 0.5)).toEqual([0, 2, 1]);
  });

  it("labels a batch for the progress line", () => {
    expect(gettyWebBatchLabel({ index: 1, total: 1 })).toBe("");
    expect(gettyWebBatchLabel({ index: 2, total: 3 })).toBe("batch 2/3");
    expect(gettyWebBatchLabel({ index: 1, total: 2, retry: true })).toBe("retry batch 1/2");
  });

  it("tells the user how many batches a selection needs, before anything is sent", () => {
    expect(gettyWebBatchSummary(250)).toContain("3 batches");
    expect(gettyWebBatchSummary(250)).toContain("100 uploads per batch");
    expect(gettyWebBatchSummary(100)).toContain("1 batch");
    expect(gettyWebBatchSummary(101)).toContain("2 batches");
    expect(gettyWebBatchSummary(0)).toContain("1 batch");
  });

  it("splits on bytes too, so one request never outgrows the helper", () => {
    const MB = 1024 * 1024;
    const sized = (n: number, bytes: number) => Array.from({ length: n }, (_v, i) => ({ id: `big-${i}`, bytes }));
    // 100 icons of 40 MB would be a 4 GB request: the byte budget cuts the batch.
    const chunks = planGettyWebBatches(sized(5, 40 * MB), { maxBytes: 100 * MB, bytesOf: (icon) => icon.bytes });
    expect(chunks.map((batch) => batch.length)).toEqual([2, 2, 1]);
    // Small files still travel 100 at a time: the icon cap is unaffected.
    expect(planGettyWebBatches(icons(250), { bytesOf: () => 4096 }).map((batch) => batch.length))
      .toEqual([100, 100, 50]);
    // An icon bigger than the whole budget goes alone; it is never dropped.
    const huge = [{ id: "huge", bytes: 300 * MB }, { id: "small", bytes: MB }];
    expect(planGettyWebBatches(huge, { maxBytes: 64 * MB, bytesOf: (icon) => icon.bytes })
      .map((batch) => batch.map((icon) => icon.id))).toEqual([["huge"], ["small"]]);
    // The budget defaults to a size the helper can take in one piece.
    expect(GETTY_WEB_MAX_BATCH_BYTES).toBeLessThan(120 * MB);
  });

  it("counts the batches of a heavy selection by its bytes in the confirm dialog", () => {
    const MB = 1024 * 1024;
    // 209 icons of 1.5 MB are 3 batches by count but 313 MB of bytes: a batch is
    // cut at 42 icons, so the dialog must say 5 before anything is sent.
    expect(gettyWebBatchSummaryOf(Array.from({ length: 209 }, () => 1.5 * MB))).toContain("5 batches");
    expect(gettyWebBatchSummaryOf(Array.from({ length: 7 }, () => 0.6 * MB))).toContain("1 batch");
    expect(gettyWebBatchSummaryOf([])).toContain("1 batch");
  });

  it("sizes a request to the running helper, not to what this build hopes for", () => {
    const MB = 1024 * 1024;
    // A helper that says what it takes is believed, up to this build's budget.
    expect(gettyWebRequestBytes(40 * MB)).toBe(40 * MB);
    expect(gettyWebRequestBytes(400 * MB)).toBe(GETTY_WEB_MAX_BATCH_BYTES);
    // An older helper reports nothing — and its Getty cap is far below today's,
    // which is what failed a 209-icon run with "the helper did not answer".
    expect(gettyWebRequestBytes(undefined)).toBe(16 * MB);
    expect(gettyWebRequestBytes(0)).toBe(16 * MB);
    expect(gettyWebRequestBytes(Number.NaN)).toBe(16 * MB);
  });

  it("keeps the cap where Getty put it", () => {
    expect(GETTY_WEB_MAX_BATCH_ICONS).toBe(100);
    // One upload plus one retry: an icon is never sent a third time.
    expect(GETTY_WEB_MAX_ATTEMPTS).toBe(2);
  });
});
