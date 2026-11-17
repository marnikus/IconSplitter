// tailcut_ui.test.tsx — the tail cutter in Generate SVG (2026-11-06): its
// settings (tolerance in the icon's px, highlight colour, highlight padding in
// screen px, auto-cut), running on the CHECKED rows only — auto cuts at once,
// otherwise each row is reviewed and its tails highlighted (preview only) —
// approving per row or for every checked reviewed row, one undo step per run.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyEntry } from "../src/state/apply";
import type { HistoryEntry } from "../src/lib/history";
import SvgPreviewBox from "../src/svg/SvgPreview";
import { useSvgEditBinding } from "../src/svg/svgedit";
import { CUT_SETTINGS_KEY, forgetCutSettings, getCutSettings, setCutSettings } from "../src/svg/tailcut/cutsettings";
import { approveCuts, runTailCutter, type CutItem } from "../src/svg/tailcut/cutactions";
import { clearTailReviews, getTailReview } from "../src/svg/tailcut/tailreview";
import { FakeDir, FakeFile } from "./helpers/fakefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TAILED = '<svg viewBox="0 0 100 100"><path d="M0 50L100 50"/><path d="M40 10L40 55"/></svg>';
const CLEAN = '<svg viewBox="0 0 100 100"><path d="M0 50L100 50"/><path d="M40 10L40 50"/></svg>';

let host: HTMLDivElement;
let ui: Root;
let root: FakeDir;
let push: ReturnType<typeof vi.fn>;
const text = (name: string) => ((root.children.get("a") as FakeDir).children.get(name) as unknown as { text: string }).text;

function Bind() { useSvgEditBinding({ current: root as never }, { push: push as never }); return null; }

beforeEach(async () => {
  localStorage.removeItem(CUT_SETTINGS_KEY); forgetCutSettings(); clearTailReviews();
  root = new FakeDir("root");
  const dir = new FakeDir("a");
  root.children.set("a", dir);
  dir.children.set("one.svg", new FakeFile("one.svg", TAILED.length, 1, TAILED));
  dir.children.set("two.svg", new FakeFile("two.svg", TAILED.length, 1, TAILED));
  push = vi.fn();
  host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
  await act(async () => { ui.render(<Bind />); });
});
afterEach(() => { act(() => ui.unmount()); host.remove(); });

const items: CutItem[] = [
  { id: "r1", svgPath: "a/one.svg", label: "one", busy: false },
  { id: "r2", svgPath: "a/two.svg", label: "two", busy: false },
];
const say = vi.fn();

describe("settings", () => {
  it("defaults, limits and remembering", () => {
    expect(getCutSettings()).toEqual({ tolerancePx: 10, color: "#ff5a5a", paddingPx: 6, auto: false });
    setCutSettings({ tolerancePx: 9999, paddingPx: -3, color: "nope", auto: true });
    expect(getCutSettings()).toEqual({ tolerancePx: 500, paddingPx: 0, color: "#ff5a5a", auto: true });
    forgetCutSettings();
    expect(getCutSettings().auto).toBe(true);
  });
});

describe("review, then approve", () => {
  it("reviews only the given rows, highlights without writing, approves only reviewed rows — one undo step", async () => {
    await runTailCutter({ items, rootRef: { current: root as never }, say }, ["r1"]);
    expect(getTailReview("r1")?.tails).toHaveLength(1);
    expect(getTailReview("r2")).toBeNull();
    expect(text("one.svg")).toBe(TAILED); // preview only
    await approveCuts({ items, rootRef: { current: root as never }, say }, ["r1", "r2"]);
    expect(text("one.svg")).toBe(CLEAN);
    expect(text("two.svg")).toBe(TAILED); // never reviewed
    expect(getTailReview("r1")).toBeNull();
    expect(push).toHaveBeenCalledTimes(1);
    const entry = push.mock.calls[0][0] as HistoryEntry;
    await expect(applyEntry(entry, entry.before)).resolves.toBe(true);
    expect(text("one.svg")).toBe(TAILED);
  });

  it("auto-cut cuts every checked row at once in one undo step, and leaves nothing to approve", async () => {
    setCutSettings({ auto: true });
    await runTailCutter({ items, rootRef: { current: root as never }, say }, ["r1", "r2"]);
    expect([text("one.svg"), text("two.svg")]).toEqual([CLEAN, CLEAN]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(getTailReview("r1")).toBeNull();
    const entry = push.mock.calls[0][0] as HistoryEntry;
    await applyEntry(entry, entry.before);
    expect([text("one.svg"), text("two.svg")]).toEqual([TAILED, TAILED]);
  });

  it("skips busy rows and says how many tails it found", async () => {
    await runTailCutter({ items: [{ ...items[0], busy: true }, items[1]], rootRef: { current: root as never }, say }, ["r1", "r2"]);
    expect(getTailReview("r1")).toBeNull();
    expect(getTailReview("r2")?.tails).toHaveLength(1);
    expect(say.mock.calls.at(-1)?.[0]).toMatch(/1 tail/);
  });
});

describe("highlights are preview only", () => {
  it("the row preview draws an end square and the tail line per tail in the chosen colour; the file is untouched", async () => {
    await act(async () => {
      ui.render(<SvgPreviewBox code={TAILED} box={{ width: 100, height: 100 }} testid="p" label="x" version={1}
        marks={{ tails: [{ tip: { x: 40, y: 55 }, path: [{ x: 40, y: 55 }, { x: 40, y: 50 }] }], color: "#00ff00", paddingPx: 6 }} />);
    });
    const shadow = (host.querySelector("[data-testid=p]") as HTMLElement).shadowRoot as ShadowRoot;
    const marks = shadow.querySelectorAll("[data-tail-mark] rect");
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute("style")).toContain("#00ff00");
    expect(TAILED).not.toContain("data-tail-mark");
  });
});

describe("wired into Generate SVG", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("the bulk bar runs, approves and opens the settings; a reviewed row approves its own cut", () => {
    const bar = src("src/svg/tailcut/TailCutBar.tsx");
    for (const id of ["svg-cut-run", "svg-cut-approve", "svg-cut-settings"]) expect(bar).toContain(id);
    expect(src("src/svg/SvgBulkBar.tsx")).toContain("<TailCutBar");
    expect(src("src/svg/svgeditslot.tsx")).toContain("svg-cut-approve-${");
  });
});
