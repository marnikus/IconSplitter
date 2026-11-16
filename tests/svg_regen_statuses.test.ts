// svg_regen_statuses.test.ts — two more item statuses in Generate SVG
// (2026-11-06): "Regenerate SVG — overlaps" and "Regenerate SVG — geometry".
// They are review decisions like ✓ / ✕ / ⚠: one per item, written into the
// pair file, undoable through the same "svgReview" entry, filterable, tallied,
// and — not being approved — they keep the item out of SVG to upload.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadHandles } from "../src/batch/store";
import { parsePairMeta, serializePairMeta, withReview } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { tallyReviews } from "../src/lib/svgfile";
import { applySvgFilters, type SvgListRow } from "../src/lib/svglist";
import { isReview, REVIEW_LABEL, REVIEW_STATUSES } from "../src/lib/svgmodel";
import { loadMetaAt, saveMetaAt } from "../src/selection/pairstore";
import { applyEntry } from "../src/state/apply";
import type { HistoryEntry } from "../src/lib/history";
import { FakeDir } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return { ...actual, loadHandles: vi.fn(async () => null) };
});
const handlesSpy = vi.mocked(loadHandles);

const NEW = ["regen-overlaps", "regen-geometry"] as const;

beforeEach(() => { handlesSpy.mockReset(); handlesSpy.mockResolvedValue(null); });

describe("the two regenerate statuses", () => {
  it("are real item statuses with their own labels", () => {
    for (const s of NEW) {
      expect(REVIEW_STATUSES).toContain(s);
      expect(isReview(s)).toBe(true);
    }
    expect(REVIEW_LABEL["regen-overlaps"]).toBe("Regenerate SVG — overlaps");
    expect(REVIEW_LABEL["regen-geometry"]).toBe("Regenerate SVG — geometry");
  });

  it("survive the pair file round trip", () => {
    for (const s of NEW) {
      const meta = withReview(pairFile("a", "a_AI.png"), s);
      const read = parsePairMeta(serializePairMeta(meta));
      expect(read.ok && read.meta.review).toBe(s);
    }
  });

  it("are counted and filtered like the others", () => {
    const tally = tallyReviews([{ review: "regen-overlaps" }, { review: "regen-geometry" }, { review: "regen-geometry" }] as never);
    expect(tally["regen-overlaps"]).toBe(1);
    expect(tally["regen-geometry"]).toBe(2);
    const row = (id: string, review: SvgListRow["review"]) => ({ id, name: id, relPath: id, generation: "generated", review, generatedAt: null, cost: null }) as unknown as SvgListRow;
    const rows = [row("x", "regen-overlaps"), row("y", "regen-geometry"), row("z", "approved")];
    expect(applySvgFilters(rows, { generation: "all", review: "regen-geometry", search: "" }).map((r) => r.id)).toEqual(["y"]);
    expect(applySvgFilters(rows, { generation: "all", review: "all", search: "overlaps" }).map((r) => r.id)).toEqual(["x"]);
  });

  it("undo / redo through the history writes them back", async () => {
    const root = new FakeDir("root");
    root.children.set("a", new FakeDir("a"));
    const path = "a/a_AI.svg.json";
    await saveMetaAt(root, path, withReview(pairFile("a", "a_AI.png"), "approved"));
    handlesSpy.mockImplementation(async (k: string) => (k === "__upload__" ? { source: root as never } : null));
    const at = { handleKey: "__upload__", metaPath: path };
    const id = pairId("a", "a", "");
    const entry = {
      type: "svgReview", label: "x", origin: "generateSvg", ids: [id],
      before: { recs: [{ id, review: "approved", at }] }, after: { recs: [{ id, review: "regen-overlaps", at }] },
    } as unknown as HistoryEntry;
    await expect(applyEntry(entry, entry.after)).resolves.toBe(true);
    expect((await loadMetaAt(root, path)).meta?.review).toBe("regen-overlaps");
    await expect(applyEntry(entry, entry.before)).resolves.toBe(true);
    expect((await loadMetaAt(root, path)).meta?.review).toBe("approved");
  });
});

describe("wired into Generate SVG", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("rows, the bulk bar and the filter offer both", () => {
    for (const s of NEW) {
      expect(src("src/svg/SvgRow.tsx")).toContain(`svg-${s}-\${id}`);
      expect(src("src/svg/SvgBulkBar.tsx")).toContain(`svg-${s}-selected`);
    }
    expect(src("src/svg/SvgListFilters.tsx")).toContain("REVIEW_LABEL");
    expect(src("src/index.css")).toContain(".svg-badge.regen-overlaps");
  });
});
