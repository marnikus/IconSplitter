// @vitest-environment node
// svg_review_item.test.ts — review is ONE status per item (2026-10-20).
// The user reported that each SVG version carried its own review status, so
// switching the shown version changed the badge. The status now belongs to the
// pair: a decision writes it once, a generation reopens it, and undo restores it
// without naming a version.

import { beforeEach, describe, expect, it } from "vitest";
import { derivedReview, parsePairMeta, serializePairMeta, withReview, withVersion } from "../src/lib/pairmeta";
import { withPreferred } from "../src/lib/pairpreferred";
import { parseVersion } from "../src/lib/svgmodel";
import { toListRow, toRow, withMeta } from "../src/svg/rowmodel";
import { decideReview, applyReviewPatch } from "../src/svg/reviewact";
import { applySvgReviewPatch } from "../src/svg/reviewundo";
import { svgSource, svgVersion, pairMetaFor, svgPathFor } from "./helpers/svgpair";
import type { SvgRefs, SvgRow } from "../src/svg/types";
import { getAppState, patchSvg, setAppState } from "../src/state/appstore";

const source = svgSource("pair_1", { name: "fog_AI.png" });

function refs(root: null = null) {
  return {
    root: { current: root }, metas: new Map(), abort: { current: null }, queue: { current: [] },
    key: { current: null }, scanKey: { current: null }, seq: { current: "idle" },
  } as never;
}

function metaWith(reviews: readonly ("pending" | "approved" | "declined" | "needs-review")[]) {
  let meta = pairMetaFor(source, []);
  reviews.forEach((review, i) => {
    meta = withVersion(meta, svgVersion(svgPathFor(source, i + 1), { version: i + 1, review }));
  });
  return meta;
}

beforeEach(() => setAppState({}));

describe("the item's review status", () => {
  it("is the same for every version the row can show", () => {
    const base = withReview(metaWith(["pending", "pending"]), "approved");
    const showsFirst = withPreferred(base, 1);
    const row = withMeta(toRow(source, showsFirst, false), showsFirst);
    expect(row.review).toBe("approved");
    expect(row.newest?.version).toBe(2);
    expect(row.preferred?.version).toBe(1); // the row shows v1 …
    expect(toListRow(row).review).toBe("approved"); // … and keeps the item's status

    const showsNewest = withMeta(toRow(source, base, false), base);
    expect(showsNewest.preferred).toBeNull(); // now it shows v2
    expect(toListRow(showsNewest).review).toBe("approved");
  });

  it("travels to the row from the pair file, not from the shown version", () => {
    const meta = withReview(metaWith(["pending", "pending"]), "declined");
    expect(toRow(source, meta, false).review).toBe("declined");
    expect(toRow(source, null, false).review).toBe("pending");
  });

  it("reopens on a new generation and survives a failed attempt", () => {
    const approved = withReview(metaWith(["pending"]), "approved");
    const regen = withVersion(approved, svgVersion(svgPathFor(source, 2), { version: 2, review: "needs-review" }));
    expect(regen.review).toBe("needs-review");
    expect(regen.versions.every((v) => v.review === "needs-review")).toBe(true);
    const failed = withVersion(regen, svgVersion("", { version: 3, status: "failed", review: "pending" }));
    expect(failed.review).toBe("needs-review");
    expect(failed.versions.at(-1)?.review).toBe("needs-review");
  });

  it("is read back from a file written before the item-level key existed", () => {
    const legacy = JSON.parse(serializePairMeta(metaWith(["pending", "pending"]))) as Record<string, unknown>;
    delete legacy.review;
    // The per-version mirror an older build wrote: one version says approved.
    (legacy.versions as { review: string }[])[0].review = "approved";
    const parsed = parsePairMeta(JSON.stringify(legacy));
    expect(parsed.ok && parsed.meta.review).toBe("approved");
    expect(derivedReview([])).toBe("pending");
    // A bogus stored value falls back to the versions rather than inventing one.
    const bogus = parsePairMeta(JSON.stringify({ ...legacy, review: "unknown" }));
    expect(bogus.ok && bogus.meta.review).toBe("approved");
  });

  it("derives a legacy review by version number even when records are out of order", () => {
    const legacy = JSON.parse(serializePairMeta(metaWith(["pending", "pending"]))) as Record<string, unknown>;
    delete legacy.review;
    const records = legacy.versions as { version: number; review: string }[];
    records[0].review = "approved";
    records[1].review = "declined";
    legacy.versions = [...records].reverse();
    const parsed = parsePairMeta(JSON.stringify(legacy));
    expect(parsed.ok && parsed.meta.review).toBe("declined");
  });

  it("is written once per row with the versions kept in step", () => {
    const meta = withReview(metaWith(["pending", "pending"]), "needs-review");
    const onDisk = parsePairMeta(serializePairMeta(meta));
    expect(onDisk.ok && onDisk.meta.review).toBe("needs-review");
    expect(onDisk.ok && onDisk.meta.versions.every((v) => v.review === "needs-review")).toBe(true);
    expect(onDisk.ok && (onDisk.meta.versions[0].review === "needs-review")).toBe(true);
  });

  it("does not change when the shown version changes", () => {
    const meta = withPreferred(withReview(metaWith(["pending", "pending"]), "approved"), 2);
    const row = withMeta(toRow(source, meta, false), meta);
    const other: SvgRow = { ...row, preferred: meta.versions[0] };
    expect(other.preferred?.version).toBe(1);
    expect(row.review).toBe(other.review);
  });
});

describe("a decision", () => {
  it("writes the item status and ONE history record, whichever version is shown", async () => {
    const meta0 = metaWith(["pending", "pending"]);
    const rows = [withMeta(toRow(source, meta0, false), meta0)];
    const pushed: { label: string; before: unknown; after: unknown }[] = [];
    const ctx = {
      rows, refs: refs(),
      setRowsFn: (fn: (all: SvgRow[]) => SvgRow[]) => rows.splice(0, rows.length, ...fn(rows)),
      say: () => {}, hist: { push: (e: { label: string; before: unknown; after: unknown }) => pushed.push(e) },
    };
    await decideReview(ctx, [source.id], "declined");
    expect(rows[0].review).toBe("declined");
    expect(rows[0].meta?.versions.every((v) => v.review === "declined")).toBe(true);
    expect(pushed).toHaveLength(1);
    expect(pushed[0].after).toEqual({ recs: [{ id: source.id, review: "declined" }] });
    expect(pushed[0].before).toEqual({ recs: [{ id: source.id, review: "pending" }] });
  });

  it("preserves a just-saved version when a review closure still holds the older row", async () => {
    const older = metaWith(["pending"]);
    const latest = metaWith(["pending", "pending"]);
    const live = refs() as SvgRefs;
    live.metas.set(source.id, latest);
    const rows = [toRow(source, older, false)];
    await decideReview({ rows, refs: live,
      setRowsFn: (fn) => rows.splice(0, rows.length, ...fn(rows)),
      say: () => {}, hist: { push: () => {} },
    }, [source.id], "approved");
    expect(live.metas.get(source.id)?.versions).toHaveLength(2);
    expect(rows[0].meta?.versions).toHaveLength(2);
    expect(rows[0].review).toBe("approved");
  });

  it("is undone by source, not by version", async () => {
    const meta0 = withReview(metaWith(["pending"]), "declined");
    const rows = [withMeta(toRow(source, meta0, false), meta0)];
    const ctx = {
      rows, refs: refs(), setRowsFn: (fn: (all: SvgRow[]) => SvgRow[]) => rows.splice(0, rows.length, ...fn(rows)),
      say: () => {}, hist: { push: () => {} },
    };
    expect(await applyReviewPatch(ctx, { recs: [{ id: source.id, review: "approved" }] })).toBe(true);
    expect(rows[0].review).toBe("approved");
    expect(rows[0].meta?.versions[0].review).toBe("approved");
    // Replaying the same status changes nothing.
    expect(await applyReviewPatch(ctx, { recs: [{ id: source.id, review: "approved" }] })).toBe(false);
  });

  it("still parses a per-version record (the mirror older builds wrote)", () => {
    const rec = parseVersion({
      version: 1, svgPath: "a.svg", status: "generated", review: "approved", prompt: "p", provider: "v",
      model: "m", requestedAt: "2026-01-01T00:00:00.000Z", completedAt: null,
      usage: { input: 1, output: 1, total: 2 }, cost: null,
      validation: { ok: true, errors: [], warnings: [], icons: 1 }, batch: null, error: null, requestId: null,
    });
    expect(rec?.review).toBe("approved");
    expect(derivedReview(rec === null ? [] : [rec])).toBe("approved");
  });

  it("says so when nothing in the file system can be patched", async () => {
    expect(await applySvgReviewPatch({ recs: [{ id: "missing", review: "approved" }] })).toBe(false);
  });
});

/** Deliberately different source-array and visible orders. */
function navigationContext() {
  const rows = ["above", "target", "reviewed", "no-svg", "next", "last"].map((id) => {
    const src = svgSource(id);
    const meta = pairMetaFor(src, id === "no-svg" ? [] : [svgVersion(svgPathFor(src, 1))]);
    return toRow(src, id === "reviewed" ? withReview(meta, "declined") : meta, false);
  });
  const visible = [...rows];
  return {
    rows: [...rows].reverse(), visible, refs: refs() as SvgRefs,
    setRowsFn(fn: (all: SvgRow[]) => SvgRow[]) { this.rows = fn(this.rows); },
    say: () => {}, hist: { push: () => {} },
  };
}

describe("SVG downward pending navigation", () => {
  it("skips reviewed and not-generated rows in visible order, not source order", async () => {
    const ctx = navigationContext();
    patchSvg({ activeId: "target", anchorId: "above", checked: ["above"] });
    await decideReview(ctx, ["target"], "approved");
    expect(getAppState().svg).toMatchObject({ activeId: "next", anchorId: "above", checked: ["above"] });
  });

  it("does not wrap, navigate on bulk, or navigate on needs-review", async () => {
    for (const [ids, decision] of [
      [["last"], "approved"], [["target", "reviewed"], "declined"], [["target"], "needs-review"], [["no-svg"], "approved"],
    ] as const) {
      const ctx = navigationContext();
      patchSvg({ activeId: "target" });
      await decideReview(ctx, [...ids], decision);
      expect(getAppState().svg.activeId).toBe("target");
    }
  });

  it("does not steal focus if the user moves while the decision is saving", async () => {
    const ctx = navigationContext();
    patchSvg({ activeId: "target" });
    const saving = decideReview(ctx, ["target"], "approved");
    patchSvg({ activeId: "above" });
    await saving;
    expect(getAppState().svg.activeId).toBe("above");
    expect(ctx.rows.find((r) => r.source.id === "target")?.review).toBe("approved");
  });

  it("skips a candidate whose live metadata was reviewed while saving", async () => {
    const ctx = navigationContext();
    patchSvg({ activeId: "target" });
    const saving = decideReview(ctx, ["target"], "approved");
    ctx.refs.metas.set("next", withReview(ctx.visible.find((r) => r.source.id === "next")!.meta!, "declined"));
    await saving;
    expect(getAppState().svg.activeId).toBe("last");
  });
});
