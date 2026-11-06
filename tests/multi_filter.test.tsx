// multi_filter.test.tsx — multi-choice filter dropdowns in every list tab
// (2026-11-06). A filter value is the "all" value, one value (the old shape, so
// stored state and history stay valid) or several; a row passes when it
// matches ANY picked value. One pure core (lib/multifilter), one dropdown with
// checkboxes (ui/MultiSelect), each tab's single-value test wrapped by anyOf.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { anyOf, dropFromMulti, multiText, parseMulti, pickedOf, toggleMulti, type Multi } from "../src/lib/multifilter";
import { applySvgFilters, type SvgListRow } from "../src/lib/svglist";
import { applyFilters, parseFilter, type ViewPair } from "../src/lib/reviewfilter";
import { applyBatchFilters, parseBatchFilter, ALL_BATCH_FILTER } from "../src/lib/batchfilter";
import { rowMatchesBadges } from "../src/lib/upload/rowbadge";
import { applyUploadFilters } from "../src/upload/rowlist";
import type { UploadListRow } from "../src/upload/types";
import MultiSelect from "../src/ui/MultiSelect";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTS = ["not-generated", "generating", "generated", "failed"] as const;
type Gen = "all" | (typeof OPTS)[number];

describe("lib/multifilter", () => {
  it("picked values: all = none picked; one value; several", () => {
    expect(pickedOf<Gen>("all", "all")).toEqual([]);
    expect(pickedOf<Gen>("generated", "all")).toEqual(["generated"]);
    expect(pickedOf<Gen>(["generating", "generated"], "all")).toEqual(["generating", "generated"]);
  });

  it("toggling builds Generating + Generated, keeps option order, collapses back", () => {
    let v: Multi<Gen> = "all";
    v = toggleMulti(v, "generated", "all", OPTS);
    expect(v).toBe("generated"); // one value = the old single shape
    v = toggleMulti(v, "generating", "all", OPTS);
    expect(v).toEqual(["generating", "generated"]);
    v = toggleMulti(v, "generated", "all", OPTS);
    expect(v).toBe("generating");
    v = toggleMulti(v, "generating", "all", OPTS);
    expect(v).toBe("all"); // nothing picked = no filter
    expect(toggleMulti(["generating", "generated"], "all", "all", OPTS)).toBe("all");
  });

  it("picking every option is the same as no filter", () => {
    expect(toggleMulti(["not-generated", "generating", "generated"], "failed", "all", OPTS)).toBe("all");
  });

  it("anyOf passes a row matching any picked value", () => {
    const want: Multi<Gen> = ["generating", "generated"];
    expect(anyOf(want, "all", (w) => w === "generated")).toBe(true);
    expect(anyOf(want, "all", (w) => w === "failed")).toBe(false);
    expect(anyOf<Gen>("all", "all", () => false)).toBe(true);
  });

  it("parses stored values strictly and drops a removed value", () => {
    expect(parseMulti(["generated", "bogus", "generated"], ["all", ...OPTS], "all")).toBe("generated");
    expect(parseMulti(["generated", "failed"], ["all", ...OPTS], "all")).toEqual(["generated", "failed"]);
    expect(parseMulti(42, ["all", ...OPTS], "all")).toBe("all");
    expect(dropFromMulti(["b1", "b2"], "b2", "all")).toBe("b1");
    expect(dropFromMulti("b1", "b1", "all")).toBe("all");
  });

  it("says what is picked", () => {
    const label = (v: string) => ({ generating: "Generating", generated: "Generated" })[v] ?? v;
    expect(multiText<Gen>(["generating", "generated"], "all", label)).toBe("Generating + Generated");
    expect(multiText<Gen>("all", "all", label)).toBe("");
  });
});

describe("every tab's filter takes several values", () => {
  it("Generate SVG: generation and review", () => {
    const row = (id: string, generation: string, review: string) => ({ id, name: id, relPath: id, generation, review }) as unknown as SvgListRow;
    const rows = [row("a", "generating", "pending"), row("b", "generated", "needs-review"), row("c", "failed", "approved")];
    const ids = (f: Parameters<typeof applySvgFilters>[1]) => applySvgFilters(rows, f).map((r) => r.id);
    expect(ids({ generation: ["generating", "generated"], review: "all", search: "" })).toEqual(["a", "b"]);
    expect(ids({ generation: "all", review: ["pending", "needs-review"], search: "" })).toEqual(["a", "b"]);
  });

  it("Selection V2: status (and it survives the stored filter / history)", () => {
    const pair = (pairId: string, decision: string) => ({ pairId, decision, relDir: "", base: pairId, source: null, ai: null, mtime: 0 }) as unknown as ViewPair;
    const pairs = [pair("p", "pending"), pair("a", "approved"), pair("d", "declined")];
    const f = parseFilter({ status: ["pending", "declined"] });
    expect(f.status).toEqual(["pending", "declined"]);
    expect(applyFilters(pairs, f).map((p) => p.pairId)).toEqual(["p", "d"]);
    expect(parseFilter({ status: "approved" }).status).toBe("approved");
  });

  it("Batch: status and review", () => {
    const r = (name: string, status: string, review: string) => ({ name, dirPath: "", relPath: name, status, review, mtime: 0 });
    const rows = [r("x", "processed", "approved"), r("y", "unprocessed", "pending"), r("z", "changed", "declined")];
    const f = parseBatchFilter({ ...ALL_BATCH_FILTER, status: ["processed", "changed"], review: ["approved", "declined", "nope"] });
    expect(applyBatchFilters(rows as never, f).map((x: { name: string }) => x.name)).toEqual(["x", "z"]);
  });

  it("SVG to upload: package, metadata and badges", () => {
    const row = (id: string, status: string, metadata: string, badges: string[]) => ({ id, name: id, relPath: id, approvedValid: 1, status, metadata, badges }) as unknown as UploadListRow;
    const rows = [row("a", "processed", "accepted", []), row("b", "failed", "empty", ["s"]), row("c", "stale", "generated", ["g"])];
    const f = (patch: object) => applyUploadFilters(rows, { status: "all", metadata: "all", search: "", badge: "all", ...patch }).map((r) => r.id);
    expect(f({ status: ["processed", "stale"] })).toEqual(["a", "c"]);
    expect(f({ metadata: ["empty", "generated"] })).toEqual(["b", "c"]);
    expect(f({ badge: ["none", "g"] })).toEqual(["a", "c"]);
  });

  it("Upload: badges (shared matcher)", () => {
    expect(rowMatchesBadges(["s"], ["g", "s"])).toBe(true);
    expect(rowMatchesBadges([], ["any"])).toBe(false);
    expect(rowMatchesBadges([], "all")).toBe(true);
  });
});

describe("the MultiSelect dropdown", () => {
  let host: HTMLDivElement;
  let ui: Root;
  beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
  afterEach(() => { act(() => ui.unmount()); host.remove(); });
  const options: [string, string][] = [["all", "All states"], ["generating", "Generating"], ["generated", "Generated"]];

  it("shows what is picked and toggles one checkbox per option", async () => {
    const onChange = vi.fn();
    await act(async () => { ui.render(<MultiSelect label="Generation" testid="g" value={["generating", "generated"]} options={options} onChange={onChange} />); });
    expect(host.querySelector("[data-testid=g]")?.textContent).toContain("Generating + Generated");
    const box = host.querySelector("[data-testid=g-opt-generated]") as HTMLInputElement;
    expect(box.checked).toBe(true);
    await act(async () => { box.click(); });
    expect(onChange).toHaveBeenCalledWith("generating");
    await act(async () => { (host.querySelector("[data-testid=g-opt-all]") as HTMLInputElement).click(); });
    expect(onChange).toHaveBeenLastCalledWith("all");
  });

  it("opens and closes from its button and Escape", async () => {
    await act(async () => { ui.render(<MultiSelect label="G" testid="g" value="all" options={options} onChange={() => undefined} />); });
    const menu = host.querySelector("[data-testid=g-menu]") as HTMLElement;
    expect(menu.hidden).toBe(true);
    await act(async () => { (host.querySelector("[data-testid=g]") as HTMLButtonElement).click(); });
    expect(menu.hidden).toBe(false);
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(menu.hidden).toBe(true);
  });
});

describe("wired into every filter dropdown", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it.each([
    "src/batch/BatchFilterGrid.tsx", "src/selectionv2/FilterGrid.tsx", "src/svg/SvgListFilters.tsx",
    "src/upload/UploadControls.tsx", "src/upload/UploadRowBadgeFilter.tsx", "src/stockupload/StockUploadControls.tsx",
  ])("%s uses MultiSelect", (file) => { expect(src(file)).toContain("<MultiSelect"); });
});
