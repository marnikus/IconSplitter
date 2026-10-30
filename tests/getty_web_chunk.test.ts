// @vitest-environment node
// Getty's batch arithmetic, without a browser: the 100-upload cap is counted in
// ICONS (a JPEG + EPS pair is one upload), so a bigger selection becomes several
// batches, the pair is never split, and "the first 100 pairs" means something.

import { describe, expect, it } from "vitest";
import {
  GETTY_WEB_MAX_ATTEMPTS, GETTY_WEB_MAX_BATCH_ICONS, GETTY_WEB_MAX_REQUEST_BYTES,
  GETTY_WEB_MAX_REQUEST_ICONS, gettyWebBatchLabel, gettyWebBatchName,
  gettyWebBatchSummary, planGettyWebBatches, planGettyWebRequests,
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
    // A run that fits in one batch keeps the plain name it always had.
    expect(gettyWebBatchName(now, 2, { index: 1, total: 1 })).toBe("IconSplitter 2026-10-30 (2 icons)");
    expect(gettyWebBatchName(now, 100, { index: 2, total: 3 })).toBe("IconSplitter 2026-10-30 2/3 (100 icons)");
    expect(gettyWebBatchName(now, 7, { index: 1, total: 1, retry: true }))
      .toBe("IconSplitter 2026-10-30 retry 1/1 (7 icons)");
    expect(gettyWebBatchName(now, 100, { index: 3, total: 3 }).length).toBeLessThanOrEqual(60);
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

  it("keeps the cap where Getty put it", () => {
    expect(GETTY_WEB_MAX_BATCH_ICONS).toBe(100);
    // One upload plus one retry: an icon is never sent a third time.
    expect(GETTY_WEB_MAX_ATTEMPTS).toBe(2);
  });
});

describe("Getty web request parts inside one batch", () => {
  const MB = 1024 * 1024;
  const sized = (sizes: readonly number[]) => sizes.map((bytes, i) => ({ id: `icon-${i}`, bytes }));
  const bytesOf = (icon: { bytes: number }) => icon.bytes;

  it("keeps every request far below the helper's body cap", () => {
    // The helper buffers a whole request (BRIDGE_FTP_MAX_BYTES, 120 MB by
    // default); a 100-icon batch of 3 MB icons used to be ~300 MB in one body.
    expect(GETTY_WEB_MAX_REQUEST_BYTES).toBeLessThanOrEqual(32 * MB);
    expect(GETTY_WEB_MAX_REQUEST_ICONS).toBeGreaterThan(0);
    expect(GETTY_WEB_MAX_REQUEST_ICONS).toBeLessThanOrEqual(GETTY_WEB_MAX_BATCH_ICONS);
  });

  it("splits a 100-icon batch into byte-bounded parts, never splitting an icon", () => {
    const parts = planGettyWebRequests(sized(Array(100).fill(3 * MB)), bytesOf, 24 * MB);
    expect(parts.map((part) => part.length)).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 4]);
    // Every icon is in exactly one part, in the plan's order.
    expect(parts.flat().map((icon) => icon.id)).toEqual(sized(Array(100).fill(0)).map((icon) => icon.id));
  });

  it("gives an icon bigger than the whole budget a request of its own", () => {
    const parts = planGettyWebRequests(sized([30 * MB, 1 * MB, 1 * MB]), bytesOf, 24 * MB);
    expect(parts.map((part) => part.map((icon) => icon.id))).toEqual([["icon-0"], ["icon-1", "icon-2"]]);
  });

  it("also caps the icon count, so tiny icons cannot fill one request", () => {
    const parts = planGettyWebRequests(sized(Array(60).fill(1024)), bytesOf, 24 * MB, 25);
    expect(parts.map((part) => part.length)).toEqual([25, 25, 10]);
  });

  it("asks for nothing when there is nothing to send", () => {
    expect(planGettyWebRequests([], bytesOf)).toEqual([]);
    // A nonsense budget can never produce an empty part or an endless loop.
    expect(planGettyWebRequests(sized([1, 1, 1]), bytesOf, 0).map((part) => part.length)).toEqual([1, 1, 1]);
  });
});
