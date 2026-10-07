// svg_pickorder.test.ts — the one rule that keeps the confirmation's contact
// sheet and the sheet the runner SENDS the same picture: the selection is an
// ORDER (the order the icons were picked), and every consumer — the dialog's
// plan, the queue's label, the runner's sources — reads it from the same place.
// Plus the sheet's identity: a composite belongs to (page label + the exact
// sources with their fingerprints), never to a page label alone, so a cached
// sheet can never be shown for a different selection.
import { describe, expect, it } from "vitest";
import { compositeSheetKey } from "../src/lib/svgcomposite";
import { inIdOrder } from "../src/lib/selectionorder";
import { DEFAULT_CONFIG } from "../src/lib/svgconfig";
import { planOf, type PlanCtx } from "../src/svg/runplan";
import { toRow } from "../src/svg/rowmodel";
import { svgSource } from "./helpers/svgpair";

/** `n` approved rows in scan order (pair_1 … pair_n). */
function planRows(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const id = `pair_${i + 1}`;
    return toRow(svgSource(id, { name: `icon-${i + 1}_AI.png`, fingerprint: `${i + 1}:100` }), null, false);
  });
}

const ctxOf = (n: number, perRequest = 4): PlanCtx => ({
  rows: planRows(n),
  m: { config: { ...DEFAULT_CONFIG, imagesPerRequest: perRequest } },
});

/** The ids of a plan's items, in the order the request will carry them. */
const sentOrder = (ctx: PlanCtx, ids: string[]) =>
  planOf(ctx, ids).flatMap((p) => p.items.map((i) => i.sourceId));

describe("the selection is an order, not a set", () => {
  it("returns the rows in the order the ids were picked, not the row order", () => {
    const rows = planRows(5);
    const idOf = (r: (typeof rows)[number]) => r.source.id;
    expect(inIdOrder(rows, ["pair_3", "pair_1", "pair_2"], idOf).map(idOf))
      .toEqual(["pair_3", "pair_1", "pair_2"]);
    // an id with no row is dropped, a repeated id cannot double a sheet cell
    expect(inIdOrder(rows, ["pair_2", "ghost", "pair_2"], idOf).map(idOf)).toEqual(["pair_2"]);
    expect(inIdOrder(rows, [], idOf)).toEqual([]);
  });

  it("plans the requests in the pick order — the sheet the runner will send", () => {
    const ctx = ctxOf(5);
    expect(sentOrder(ctx, ["pair_3", "pair_1", "pair_2"])).toEqual(["pair_3", "pair_1", "pair_2"]);
    // the pick order also decides WHICH images share a request
    const perTwo = ctxOf(5, 2);
    const order = sentOrder(perTwo, ["pair_5", "pair_2", "pair_4"]);
    expect(order).toEqual(["pair_5", "pair_2", "pair_4"]);
    expect(planOf(perTwo, ["pair_5", "pair_2", "pair_4"])[0].items.map((i) => i.name))
      .toEqual(["icon-5_AI", "icon-2_AI"]);
  });
});

describe("a cached contact sheet belongs to its sources, not to a page label", () => {
  const src = (i: number) => ({ id: `pair_${i}`, fingerprint: `${i}:100` });

  it("gives the same page label different keys for different selections", () => {
    // both selections are ONE page, so both plans are called batch_1_1
    expect(compositeSheetKey("batch_1_1", [src(1)])).not.toBe(compositeSheetKey("batch_1_1", [src(2)]));
    expect(compositeSheetKey("batch_1_2", [src(1), src(2)]))
      .not.toBe(compositeSheetKey("batch_1_2", [src(2), src(1)]));
    // the same selection in the same order IS the same key (a page turn reuses it)
    expect(compositeSheetKey("batch_1_2", [src(1), src(2)]))
      .toBe(compositeSheetKey("batch_1_2", [src(1), src(2)]));
  });

  it("changes when a source file changed under the same page label", () => {
    expect(compositeSheetKey("batch_1_1", [{ id: "pair_1", fingerprint: "20:3100" }]))
      .not.toBe(compositeSheetKey("batch_1_1", [{ id: "pair_1", fingerprint: "24:3300" }]));
  });
});
