// Deterministic work budgets supplement the real Chromium timing benchmark.
// Spies delegate to real algorithms: no preview/parser/format implementation is mocked.
import { readFileSync } from "node:fs";
import * as rowmodel from "../src/upload/rowmodel";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { AS_IS_SETTINGS } from "../src/lib/upload/asis";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Fixture } from "../tools/perf/selection-response";
import * as fmt from "../src/selection/fmt";
import * as preview from "../src/lib/svgpreview";
import * as decorations from "../src/lib/upload/decorations";
import { useBatchSelection } from "../src/batch/useBatchSelection";
import { patchBatch, resetAppStore } from "../src/state/appstore";
import { atScale } from "./helpers/scale";

// Selection work is independent of export geometry; full previews are covered separately.
const settings = { ...DEFAULT_UPLOAD_SETTINGS, ...AS_IS_SETTINGS };
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  resetAppStore();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); resetAppStore();
});

it.each(["batch", "selectionV2", "generateSvg", "upload"] as const)('%s: every checkbox changes without rerunning row presentation', async (tab) => {
  // Row count is a render budget, not an assertion: the guard is "no row presentation
  // work when rows are selected" at any scale (ICONSPLITTER_TEST_SCALE=full restores 100).
  const count = atScale(100, 40);
  const dates = vi.spyOn(fmt, "fmtDate");
  const svg = vi.spyOn(preview, "buildSvgPreview");
  const shell = vi.spyOn(rowmodel, "statusOf");
  const rowSettings = vi.spyOn(decorations, "rowSettings");
  await act(async () => { root.render(<Fixture tab={tab} count={count} settings={settings} />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 220)); });
  const work = tab === "batch" || tab === "selectionV2" ? dates : tab === "generateSvg" ? svg : rowSettings;
  expect(work.mock.calls.length).toBeGreaterThan(0); // prove the real presentation executed
  for (const on of [true, false, true]) {
    work.mockClear(); shell.mockClear();
    act(() => host.querySelector<HTMLButtonElement>(on ? "#select-all" : "#clear-all")!.click());
    expect(host.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(on ? count : 0);
    expect(host.querySelectorAll('[role="listitem"]')).toHaveLength(count);
    expect(host.querySelectorAll('[role="listitem"].selected')).toHaveLength(on ? count : 0);
    expect(work.mock.calls.length).toBe(0);
    if (tab === "upload") expect(shell.mock.calls.length).toBe(0);
  }
});

it('Batch reconciliation reads rows linearly rather than searching the list for every row', async () => {
  let reads = 0;
  const rows = Array.from({ length: 1000 }, (_, i) => ({ get relPath() { reads++; return `dir/${i}_AI.png`; }, status: "unprocessed", selected: false }));
  const ids = Array.from({ length: 1000 }, (_, i) => `dir/${i}_AI.png`);
  patchBatch({ checked: ids });
  const setSelected = vi.fn();
  function Harness() { useBatchSelection({ s: { rows }, setSelected }, rows); return null; }
  await act(async () => { root.render(<Harness />); });
  expect(setSelected).toHaveBeenCalledExactlyOnceWith(ids, true);
  expect(reads).toBeLessThan(15000);
});

it('does not start background transitions on every selected row', () => {
  const css = readFileSync("src/index.css", "utf8");
  const rules = [...css.matchAll(/\.(?:v2-row|svg-row|up-row|batch-row)\s*\{([^}]*)\}/g)];
  expect(rules.length).toBeGreaterThanOrEqual(4);
  for (const rule of rules) expect(rule[1]).not.toMatch(/transition:[^;]*background/);
});
