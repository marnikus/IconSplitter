// selection_perf_budgets.test.tsx — deterministic guards for the work the
// response fix removed. Deliberately NOT wall-clock assertions: they count
// renders, id reads and serialized bytes, so a slow CI machine cannot make them
// flaky and a regression cannot hide behind one.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Fixture } from "../tools/perf/selection-response";
import { decidableCount, countsOf } from "../src/svg/panelcounts";
import { HISTORY_VERSION, emptyTimeline, pushEntry, serializeTimeline } from "../src/lib/history";
import { selectionPayloads, touchedIds } from "../src/lib/selectiondelta";
import { patchUpload, patchV2Selection, resetAppStore } from "../src/state/appstore";
import { HistoryProvider, useHistoryActions, useHistoryView } from "../src/state/HistoryProvider";
import { useAppSlice } from "../src/state/useAppState";
import type { SvgRow } from "../src/svg/types";
import { useVisibleRows } from "../src/batch/useBatchView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  resetAppStore();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); resetAppStore();
});

const rows = (n: number, prefix = "C:/projects/pack/ai-results/icon") =>
  Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(5, "0")}_AI.png`);

describe("a gesture only wakes the tab that owns it", () => {
  it("an upload patch re-renders upload consumers and nobody else", async () => {
    let shell = 0, v2 = 0, upload = 0, svg = 0;
    function ShellProbe() { useAppSlice("tab"); shell++; return null; }
    function V2Probe() { useAppSlice("v2"); v2++; return null; }
    function UploadProbe() { useAppSlice("upload"); upload++; return null; }
    function SvgProbe() { useAppSlice("svg"); svg++; return null; }
    await act(async () => root.render(<><ShellProbe /><V2Probe /><UploadProbe /><SvgProbe /></>));
    expect([shell, v2, upload, svg]).toEqual([1, 1, 1, 1]);
    act(() => patchUpload({ checked: ["a"] }));
    expect([shell, v2, upload, svg]).toEqual([1, 1, 2, 1]);
    act(() => patchV2Selection({ checked: ["b"], anchorId: "b", activeId: "b" }));
    // the whole V2 gesture — checked, anchor AND the shared active row — is ONE
    // notification; the upload panel (and the shell) must not wake up.
    expect([shell, v2, upload, svg]).toEqual([1, 2, 2, 1]);
  });
});

describe("history no longer broadcasts to the panels that record", () => {
  it("pushing an entry re-renders the history view only", async () => {
    let actions = 0, view = 0;
    let push: ReturnType<typeof useHistoryActions>["push"] | null = null;
    function ActionsProbe() { const a = useHistoryActions(); push = a.push; actions++; return null; }
    function ViewProbe() { useHistoryView(); view++; return null; }
    await act(async () => root.render(<HistoryProvider><ActionsProbe /><ViewProbe /></HistoryProvider>));
    expect([actions, view]).toEqual([1, 1]);
    act(() => push!({ type: "checked", label: "Toggle row", origin: "selectionV2", ids: ["a"], before: [], after: ["a"] }));
    expect(view).toBe(2);
    expect(actions).toBe(1); // the recorder never re-renders
  });
});

describe("history payload stays sized by the CHANGE, not the selection", () => {
  const entry = (before: string[], after: string[], active: string | null = null) => {
    const payload = selectionPayloads(
      { checked: before, active, anchor: active },
      { checked: after, active, anchor: active },
    );
    return {
      id: `h${Math.random()}`, type: "checked", label: "Toggle row",
      at: "2026-10-26T10:00:00.000Z", origin: "selectionV2",
      ids: touchedIds(before, after), before: payload.before, after: payload.after, v: HISTORY_VERSION,
    };
  };

  it("keeps a 100-entry 1,000-row timeline tiny", () => {
    const all = rows(1000);
    let timeline = emptyTimeline();
    let checked = [...all];
    for (let i = 0; i < 100; i += 1) {
      const target = all[i % all.length];
      const next = checked.includes(target) ? checked.filter((id) => id !== target) : [...checked, target];
      timeline = pushEntry(timeline, entry(checked, next));
      checked = next;
    }
    const bytes = serializeTimeline(timeline).length;
    // The old format stored three whole arrays per gesture: 15.4 MB here.
    expect(bytes).toBeLessThan(64_000);
    for (const e of timeline.entries) {
      expect(JSON.stringify(e)).not.toContain(all[500]); // no whole-array copy hides in an entry
    }
  });

  it("keeps a one-row change inside a 1,000-row selection tiny", () => {
    const all = rows(1000);
    const e = entry(all, all.filter((id) => id !== all[500]));
    expect(JSON.stringify(e).length).toBeLessThan(1_000);
    expect(e.ids).toEqual([all[500]]);
  });

  it("stores a select-all once per direction and caps the labelled ids", () => {
    const all = rows(1000);
    const e = entry([], all);
    expect(e.ids.length).toBeLessThanOrEqual(24);
    const json = JSON.stringify(e);
    // 1,000 changed rows MUST be named to restore them; what must not happen is a
    // third copy (the old top-level `ids` held up to 1,000) or a per-id object.
    // (the capped `ids` LABEL repeats at most the 24 ids it names)
    for (const id of [all[500], all[999]]) expect(json.split(id).length - 1).toBe(2);
    const oneList = JSON.stringify(all).length;
    expect(json.length).toBeLessThan(oneList * 2.5);
    expect(json).not.toContain('"index":');
  });
});

describe("derived counts are linear", () => {
  const svgRows = (n: number): SvgRow[] => Array.from({ length: n }, (_, i) => ({
    source: { id: `src-${i}`, name: `icon-${i}`, relPath: `a/${i}.png` },
    review: "approved", status: "generated", svg: null, versions: [], tokens: null,
  }) as unknown as SvgRow);

  it("decidableCount reads each row once", () => {
    const list = svgRows(5000);
    const affected = Array.from({ length: 500 }, (_, i) => `src-${i}`);
    // getter counter: the old O(affected × rows) `rows.find` read ~2.5M times
    let reads = 0;
    const counted = list.map((row) => ({ ...row, get source() { reads += 1; return row.source; } })) as SvgRow[];
    const started = decidableCount(counted, affected);
    expect(started).toBe(0); // these rows carry no version, so nothing is decidable
    expect(reads).toBeLessThan(list.length * 4);
  });

  it("countsOf is one pass", () => {
    const list = svgRows(5000);
    let reads = 0;
    const counted = list.map((row) => ({ ...row, get status() { reads += 1; return row.status; }, get review() { reads += 1; return row.review; } })) as SvgRow[];
    expect(countsOf(counted)).toEqual({ eligible: 5000, generated: 5000, approved: 5000, failed: 0 });
    expect(reads).toBeLessThanOrEqual(list.length * 3);
  });
});

describe("a Batch checkbox does not re-filter and re-sort the folder (D8)", () => {
  const FILTER = { date: { mode: "all" as const }, status: "all" as const, review: "all" as const, search: "" };
  const SORT = { by: "status" as const, dir: "asc" as const };
  const batchRow = (i: number) => ({
    relPath: `pack/icon-${i}_AI.png`, dirPath: "pack", name: `icon-${i}`, mtime: 1_700_000_000_000 + i,
    status: "unprocessed", review: "pending", selected: false,
  });
  type BatchRows = Parameters<typeof useVisibleRows>[0];
  const bRows = (n: number) => Array.from({ length: n }, (_, i) => batchRow(i)) as unknown as BatchRows;
  let visible: BatchRows | null = null;

  function Probe({ rows }: { rows: BatchRows }) {
    visible = useVisibleRows(rows, FILTER, SORT);
    return null;
  }

  it("keeps the visible array when only the selection mirror changed", async () => {
    const first = bRows(200);
    await act(async () => root.render(<Probe rows={first} />));
    const before = visible;
    expect(before).not.toBeNull();
    // the same rows with only `selected` flipped: exactly what a checkbox writes
    const mirror = first.map((r) => ({ ...r, selected: true }));
    await act(async () => root.render(<Probe rows={mirror} />));
    expect(visible).toBe(before); // no second filter, no second sort
    // …but a real data change still invalidates the view
    const changed = mirror.map((r) => ({ ...r, status: "processed" as const }));
    await act(async () => root.render(<Probe rows={changed} />));
    expect(visible).not.toBe(before);
    // and the view really is the filtered/sorted result of the latest rows
    expect((visible as unknown as { status: string }[]).every((r) => r.status === "processed")).toBe(true);
  });
});

describe("the list node survives a selection and an arrow change", () => {
  it("keeps one DOM node per row and projects active + checked into it", async () => {
    await act(async () => root.render(<Fixture tab="selectionV2" count={120} />));
    const first = host.querySelector('[data-testid^="v2-row-"]') as HTMLElement;
    const id = first.getAttribute("data-testid")!.replace("v2-row-", "");
    await act(async () => { host.querySelector<HTMLButtonElement>("#click-first")!.click(); });
    const afterClick = host.querySelector(`[data-testid="v2-row-${id}"]`) as HTMLElement;
    expect(afterClick).toBe(first); // same node: no row element was recreated
    expect(afterClick.getAttribute("aria-current")).toBe("true");
    expect(afterClick.classList.contains("active")).toBe(true);

    await act(async () => { host.querySelector<HTMLButtonElement>("#toggle-first")!.click(); });
    expect(host.querySelector(`[data-testid="v2-row-${id}"]`)).toBe(first);
    expect((first.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(first.classList.contains("selected")).toBe(true);
    expect(first.getAttribute("aria-current")).toBe("true");
  });
});
