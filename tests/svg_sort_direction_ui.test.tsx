// svg_sort_direction_ui.test.tsx — "when was it created" in the real panel, plus
// the one direction arrow (2026-11-02). The list must offer both created-times as
// orders, show which direction is in force for whatever order and filter is
// selected, and reverse the visible rows when the arrow is clicked — including a
// grouped order and a row set narrowed by the search and the review filter.
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { isStateSort } from "../src/lib/statesort";
import {
  COURT, FOG, installSvgPanelHooks, makeRoot, mount, q, settle, text,
} from "./helpers/svgpanel";
import { isMultiSelect, pickOnly } from "./helpers/multiselect";

installSvgPanelHooks();

const ARCH = pairId("architecture", "arch", "");
const ZEN = pairId("architecture", "zen", "");
const IDS = [ARCH, COURT, FOG, ZEN];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ object: "list", data: [] }), { status: 200 })));
});

const mtime = (iso: string): number => Date.parse(iso);

/** Four approved sources whose AI files and SVG files have deliberately mixed ages. */
async function agedSources(): Promise<FakeDir> {
  const root = await makeRoot();
  const arch = root.children.get("architecture") as FakeDir;
  const decisions = JSON.parse((root.children.get("review-decisions.json") as FakeFile).text) as { records: object[] };
  const ages: [string, string, string, string, string][] = [
    // name, pair id, AI file time, SVG record time, review
    ["court", COURT, "2026-01-05T10:00:00Z", "2026-05-01T10:00:00Z", "approved"],
    ["fog", FOG, "2026-03-05T10:00:00Z", "2026-04-01T10:00:00Z", "approved"],
    ["arch", ARCH, "2026-02-05T10:00:00Z", "2026-06-01T10:00:00Z", "pending"],
    ["zen", ZEN, "2026-04-05T10:00:00Z", "2026-03-01T10:00:00Z", "declined"],
  ];
  for (const [name, id, aiTime, svgTime, review] of ages) {
    arch.children.set(`${name}.png`, new FakeFile(`${name}.png`, 12, mtime(aiTime) - 1000, "reference"));
    arch.children.set(`${name}_AI.png`, new FakeFile(`${name}_AI.png`, 20, mtime(aiTime), "result"));
    arch.children.set(`${name}_AI.svg`, new FakeFile(`${name}_AI.svg`, 10, mtime(svgTime), SIDE_DOC));
    arch.children.set(`${name}_AI.svg.json`, new FakeFile(`${name}_AI.svg.json`, 10, mtime(svgTime), pairOf(id, name, svgTime, review)));
    decisions.records = decisions.records.filter((r) => (r as { pair_id: string }).pair_id !== id);
    decisions.records.push({ pair_id: id, source: `architecture/${name}.png`, ai_result: `architecture/${name}_AI.png`,
      decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" });
  }
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify(decisions)));
  return root;
}

const SIDE_DOC = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z" fill="#c22f2f"/></svg>';

/** One pair file with a single generated version carrying the given time. */
function pairOf(id: string, name: string, iso: string, review: string): string {
  return JSON.stringify({
    v: 2,
    pair: { id, base: name, suffix: "", dir: "architecture" },
    ai: { relPath: `architecture/${name}_AI.png`, size: 20, mtime: 3100 },
    source: { relPath: `architecture/${name}.png`, size: 12, mtime: 3000 },
    decision: "approved", reviewedAt: "2026-10-01T09:00:00.000Z", review, preferred: null,
    versions: [{
      version: 1, svgPath: `architecture/${name}_AI.svg`, status: "generated", review,
      prompt: "", provider: "test", model: "test", requestedAt: iso, completedAt: iso,
      usage: { input: null, output: null, total: null },
      cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" },
      validation: { ok: true, errors: [], warnings: [], icons: 1 },
      batch: null, error: null, requestId: null,
    }],
    imageVersions: [], imagePreferred: null,
  });
}

const visibleIds = () => [...(q("[data-testid=svg-rows]") as HTMLElement).querySelectorAll<HTMLElement>("[data-testid^=svg-row-pair_]")]
  .map((el) => el.dataset.testid!.replace("svg-row-", ""));
const sortSelect = () => q("[data-testid=svg-sort]") as HTMLSelectElement;
const dirButton = () => q("[data-testid=svg-sort-dir]") as HTMLButtonElement;

async function chooseSort(value: string): Promise<void> {
  await act(async () => {
    const el = sortSelect();
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

async function clickDir(): Promise<void> {
  await act(async () => { dirButton().click(); });
  await settle();
}

async function chooseFilter(testId: string, value: string): Promise<void> {
  if (isMultiSelect(q(`[data-testid=${testId}]`))) { await pickOnly(document, testId, value); await settle(); return; }
  await act(async () => {
    const el = q(`[data-testid=${testId}]`) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

describe("the created-time orders", () => {
  it("offers both created-times as orders beside the existing ones", async () => {
    await mount(await agedSources());
    await settle();
    const values = [...sortSelect().options].map((o) => o.value);
    expect(values).toContain("svg-created");
    expect(values).toContain("ai-created");
    expect(values).toEqual(expect.arrayContaining(["date", "name", "cost"]));
    const labels = [...sortSelect().options].map((o) => o.textContent ?? "");
    expect(labels.some((l) => /svg created/i.test(l))).toBe(true);
    expect(labels.some((l) => /ai source created/i.test(l))).toBe(true);
  });

  it("orders the rows by the SVG's own time, newest first, and flips to oldest first", async () => {
    await mount(await agedSources());
    await settle();
    await chooseSort("svg-created");
    // arch 2026-06, court 2026-05, fog 2026-04, zen 2026-03
    expect(visibleIds()).toEqual([ARCH, COURT, FOG, ZEN]);
    await clickDir();
    expect(visibleIds()).toEqual([ZEN, FOG, COURT, ARCH]);
  });

  it("orders by the AI source's own time — a different order from the SVG's", async () => {
    await mount(await agedSources());
    await settle();
    await chooseSort("ai-created");
    // zen 2026-04, fog 2026-03, arch 2026-02, court 2026-01
    expect(visibleIds()).toEqual([ZEN, FOG, ARCH, COURT]);
    await clickDir();
    expect(visibleIds()).toEqual([COURT, ARCH, FOG, ZEN]);
  });
});

describe("the direction arrow for any order and filter", () => {
  it("says which direction is in force and starts at the order's own direction", async () => {
    await mount(await agedSources());
    await settle();
    await chooseSort("name");
    expect(dirButton().getAttribute("data-dir")).toBe("asc");
    expect(dirButton().getAttribute("aria-label")).toContain("ascending");
    expect(visibleIds()).toEqual([ARCH, COURT, FOG, ZEN]);
    await chooseSort("svg-created"); // picking an order restores its own direction
    expect(dirButton().getAttribute("data-dir")).toBe("desc");
    expect(dirButton().getAttribute("aria-label")).toContain("descending");
    expect(visibleIds()).toEqual([ARCH, COURT, FOG, ZEN]);
  });

  it("reverses the order that is in force, keeping the filter's scope", async () => {
    await mount(await agedSources());
    await settle();
    await chooseFilter("svg-filter-review", "approved"); // drops arch (pending) and zen (declined)
    await chooseSort("svg-created");
    expect(visibleIds()).toEqual([COURT, FOG]);
    await clickDir();
    expect(visibleIds()).toEqual([FOG, COURT]);
    // and the filter still holds: two rows, never four
    expect(visibleIds()).toHaveLength(2);
    expect(text("[data-testid=svg-shown]")).toContain("2 of 4");
  });

  it("applies to a grouped order too, swapping the blocks instead of scrambling them", async () => {
    await mount(await agedSources());
    await settle();
    await chooseSort("approved");
    expect(isStateSort("approved")).toBe(true);
    expect(visibleIds()).toEqual([COURT, FOG, ARCH, ZEN]); // approved first, names ascending
    await clickDir();
    expect(visibleIds()).toEqual([ARCH, ZEN, COURT, FOG]); // not approved first, same names
    expect(dirButton().getAttribute("data-dir")).toBe("asc");
  });

  it("keeps the direction when the filters change, so the arrow is truly global", async () => {
    await mount(await agedSources());
    await settle();
    await chooseSort("name");
    await clickDir();
    expect(visibleIds()).toEqual([ZEN, FOG, COURT, ARCH]);
    await chooseFilter("svg-filter-review", "approved");
    expect(visibleIds()).toEqual([FOG, COURT]); // still Z→A inside the filter
    await chooseFilter("svg-filter-review", "all");
    expect(visibleIds()).toEqual([ZEN, FOG, COURT, ARCH]);
    expect(IDS.filter((id) => visibleIds().includes(id))).toHaveLength(4);
  });
});
