// selectionv2_ui.test.tsx — RULE 8: DOM-level tests for the V2 Selection
// surface (spec V2 §16). Everything here drives the real panel: folder pick →
// recursive scan → list review rows → zoom → selection → bulk approve →
// persistence, against in-memory FS fakes. No component logic is re-implemented.
// An approval writes ONE file beside the pair's images (I-41); the root never
// gains a review-decisions.json (I-42).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots, rememberKnownRoot } from "../src/lib/knownroots";
import { parsePairMeta } from "../src/lib/pairmeta";
import { LEGACY_FILE } from "../src/selection/pairstore";
import SelectionV2Panel from "../src/selectionv2/SelectionV2Panel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import { resetAppStore } from "../src/state/appstore";
import { PREFS_KEY } from "../src/selectionv2/prefsstore";
import { BrokenFile, FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type PickerWindow = { showDirectoryPicker?: () => Promise<unknown> };

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");
const HARBOR = pairId("coastal", "harbor", "");
const DUNES = pairId("coastal", "dunes", ""); // original without an AI result

/** split_root/architecture/{fog,court} + coastal/{harbor, dunes(unpaired)}. */
function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
  arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
  arch.children.set("court.png", new FakeFile("court.png", 12, 2000, "c"));
  arch.children.set("court_AI.png", new FakeFile("court_AI.png", 20, 2100, "d"));
  root.children.set("architecture", arch);
  const coast = new FakeDir("coastal");
  coast.children.set("harbor.png", new FakeFile("harbor.png", 12, 1000, "e"));
  coast.children.set("harbor_AI.png", new FakeFile("harbor_AI.png", 20, 1100, "f"));
  coast.children.set("dunes.png", new FakeFile("dunes.png", 12, 500, "g"));
  root.children.set("coastal", coast);
  return root;
}

/**
 * The reported tree: the unsplit sheets the batch was given, and the pieces the
 * batch wrote inside `_split_output` — only the pieces are reviewable (I-38).
 */
function makeBatchRoot(): FakeDir {
  const root = new FakeDir("test_processing");
  root.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
  root.children.set("icon-sheet_AI.png", new FakeFile("icon-sheet_AI.png", 20, 1100, "d"));
  const split = new FakeDir("split_01");
  split.children.set("icon-sheet.png", new FakeFile("icon-sheet.png", 12, 1000, "c"));
  split.children.set("icon-sheet_AI_01.png", new FakeFile("icon-sheet_AI_01.png", 20, 1200, "e"));
  const sheet = new FakeDir("icon-sheet_AI");
  sheet.children.set("split_01", split);
  const run = new FakeDir("2026-10-01_10-24-31");
  run.children.set("icon-sheet_AI", sheet);
  const month = new FakeDir("2026-10");
  month.children.set("2026-10-01_10-24-31", run);
  const out = new FakeDir("_split_output");
  out.children.set("2026-10", month);
  root.children.set("_split_output", out);
  return root;
}

describe("Selection V2 panel", () => {
  beforeEach(async () => {
    localStorage.clear();
    resetAppStore(); // no checked rows / filters leaking between tests
    clearKnownRoots(); // no path bindings leaking between tests (I-63)
    await dropDb();
  });

  it("lists only the batch's split output, and says why the list is short", async () => {
    const { el } = await mount(makeBatchRoot());
    // the split piece is a row; the unsplit sheet the batch was given is not
    expect(rows(el).length).toBe(1);
    expect(text(el, "[data-testid='v2-scan-scope']")).toContain("Scope: split output only");
    expect(text(el, "[data-testid='v2-scan-scope']")).toContain("not listed");
  });

  it("keeps the whole folder when no split output exists", async () => {
    const { el } = await mount(makeRoot());
    expect(text(el, "[data-testid='v2-scan-scope']")).toContain("no split output found");
  });

  it("scans recursively, pairs both sides and lists one row per pair", async () => {
    const { el } = await mount(makeRoot());
    expect(rows(el).length).toBe(4);
    expect(text(el, `[data-testid='v2-row-${FOG}']`)).toContain("fog_AI.png");
    expect(text(el, `[data-testid='v2-row-${FOG}']`)).toContain("architecture");
    // every row carries BOTH labelled thumbnails (spec V2 §3)
    for (const id of [FOG, COURT, HARBOR, DUNES]) {
      expect(q(el, `[data-testid='v2-row-${id}'] [data-testid='v2-thumb-src']`)?.textContent).toContain("Original");
      expect(q(el, `[data-testid='v2-row-${id}'] [data-testid='v2-thumb-ai']`)?.textContent).toContain("AI result");
    }
    // the unpaired original keeps its row with a labelled placeholder (RULE 4)
    expect(q(el, `[data-testid='v2-row-${DUNES}'] [data-testid='v2-thumb-ai'] [role='img']`)
      ?.getAttribute("aria-label")).toBe("AI result missing");
    expect(text(el, "[data-testid='v2-count-total']")).toContain("4");
  });

  it("shows the unpaired original as a missing AI result, never silently", async () => {
    const { el } = await mount(makeRoot());
    expect(text(el, `[data-testid='v2-status-${DUNES}']`)).toContain("AI result missing");
    expect(text(el, "[data-testid='v2-count-attention']")).toContain("1");
    expect((q(el, `[data-testid='v2-open-ai-${DUNES}']`) as HTMLButtonElement).disabled).toBe(true);
  });

  it("copies the FOLDER of the captured full path from a row's open button", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: async () => "F:\\Stocks 2026\\icons\\split_root",
        writeText: async (t: string) => { written.push(t); },
      }, configurable: true,
    });
    // The browser cannot read the drive, so the full path comes from Explorer's
    // copy, captured at pick time — the row then shows it (I-35/I-46).
    const { el } = await mount(makeRoot());
    expect(text(el, "[data-testid='v2-folder-path']")).toContain("F:\\Stocks 2026\\icons\\split_root");
    const row = rows(el)[0];
    const pair = row.getAttribute("data-testid")?.replace("v2-row-", "") ?? "";
    await click(q(el, `[data-testid='v2-open-ai-${pair}']`) as HTMLElement);
    // the folder, as a full Windows path — never the file, never forward slashes
    expect(written).toEqual(["F:\\Stocks 2026\\icons\\split_root\\architecture"]);
    expect(text(el, "[data-testid='v2-toast']")).toContain("Folder path copied");
  });

  it("keeps the picked root name when the scan commits in the same batch", async () => {
    const { el } = await mount(makeRoot());
    // The scan commit is built from a state snapshot; a snapshot taken before
    // the pick used to win and the pill fell back to "Choose source folder…".
    expect(text(el, "[data-testid='v2-folder-path']")).toContain("split_root");
    expect(rows(el).length).toBeGreaterThan(0);
  });

  it("shows the full path in its own row as soon as a pick captures it, without a reload", async () => {
    const root = makeRoot();
    const { el } = await mount(root, "F:\\Stocks 2026\\icons\\split_root\\");
    const before = rows(el).length;
    expect(text(el, "[data-testid='v2-folder-path']")).toContain("F:\\Stocks 2026\\icons\\split_root");
    // a capture in another tab reaches this row live (I-36/RULE 24) — bound to
    // THIS folder's handle, never to its name (I-63)
    await act(async () => { rememberKnownRoot(root, "D:\\backup\\split_root"); });
    expect(text(el, "[data-testid='v2-folder-path']")).toContain("D:\\backup\\split_root");
    expect(rows(el).length).toBe(before); // the list is untouched by a path capture
  });

  it("loads both sides of a pair as real object-URL thumbnails", async () => {
    const { el } = await mount(makeRoot());
    const row = q(el, `[data-testid='v2-row-${FOG}']`)!;
    const src = q(row, "[data-testid='v2-thumb-src']")?.firstElementChild as HTMLImageElement;
    const ai = q(row, "[data-testid='v2-thumb-ai']")?.firstElementChild as HTMLImageElement;
    expect(src.tagName).toBe("IMG");
    expect(src.src.startsWith("blob:")).toBe(true);
    expect(ai.src).not.toBe(src.src); // one object URL per side, both cached per path
    expect(src.alt).toBe("Original thumbnail");
    expect(ai.alt).toBe("AI result thumbnail");
  });

  it("switches between list review and comparison, and the list has no compare panel", async () => {
    const { el } = await mount(makeRoot());
    expect(q(el, "[data-testid='v2-list']")).toBeTruthy();
    expect(q(el, "[data-testid='sel-compare']")).toBeNull();
    await click(q(el, "[data-testid='v2-mode-compare']")!);
    expect(q(el, "[data-testid='sel-compare']")).toBeTruthy();
    expect(q(el, "[data-testid='v2-list']")).toBeNull();
    await click(q(el, "[data-testid='v2-mode-list']")!);
    expect(q(el, "[data-testid='v2-list']")).toBeTruthy();
  });

  it("marks the clicked row active and decides it with A / D", async () => {
    const { el } = await mount(makeRoot());
    await click(q(el, `[data-testid='v2-row-${HARBOR}']`)!);
    expect(q(el, `[data-testid='v2-row-${HARBOR}']`)?.getAttribute("aria-current")).toBe("true");
    await check(q(el, "[data-testid='v2-autonext']") as HTMLInputElement, false); // stay on this row
    await key("a");
    expect(text(el, `[data-testid='v2-status-${HARBOR}']`)).toBe("✓ Approved");
    expect(q(el, `[data-testid='v2-row-${HARBOR}']`)?.getAttribute("aria-current")).toBe("true");
    await key("d");
    expect(text(el, `[data-testid='v2-status-${HARBOR}']`)).toBe("✕ Declined");
    expect(text(el, "[data-testid='v2-count-declined']")).toContain("1");
  });

  it("advances to the next pending pair after a decision while auto-next is on", async () => {
    const { el } = await mount(makeRoot());
    await click(q(el, `[data-testid='v2-row-${FOG}']`)!);
    expect((q(el, "[data-testid='v2-autonext']") as HTMLInputElement).checked).toBe(true);
    await key("a");
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
    expect(q(el, "[aria-current='true']")?.getAttribute("data-testid")).not.toBe(`v2-row-${FOG}`);
  });

  it("moves the active row with the arrow keys", async () => {
    const { el } = await mount(makeRoot());
    await click(q(el, `[data-testid='v2-row-${FOG}']`)!);
    await key("ArrowDown");
    const active = el.querySelector("[aria-current='true']");
    expect(active?.getAttribute("data-testid")).not.toBe(`v2-row-${FOG}`);
  });

  it("zoom slider exposes its bounds, live value, pair box and persistence", async () => {
    const { el, ui } = await mount(makeRoot());
    const slider = q(el, "[data-testid='v2-thumb']") as HTMLInputElement;
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(["48", "800", "4", "84"]);
    expect(slider.getAttribute("aria-label")).toBe("Thumbnail maximum height");
    expect(text(el, "[data-testid='v2-thumb-value']")).toBe("84 px");
    await slide(slider, "128");
    expect(text(el, "[data-testid='v2-thumb-value']")).toBe("128 px");
    // the row height AND the pair's own box follow the slider immediately
    expect(q(el, "[data-testid='v2-list']")?.getAttribute("style")).toContain("--v2-thumb: 128px");
    const row = q(el, `[data-testid='v2-row-${FOG}']`) as HTMLElement;
    expect(box(row, "v2-thumb-src")).toEqual({ w: 128, h: 128 });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!).thumbHeight).toBe(128);
    await act(async () => { ui.unmount(); });
    const again = await mount(makeRoot());
    expect((q(again.el, "[data-testid='v2-thumb']") as HTMLInputElement).value).toBe("128");
    expect(text(again.el, "[data-testid='v2-thumb-value']")).toBe("128 px");
    await act(async () => { again.ui.unmount(); });
  });

  it("zooms to 800 px at each side's own ratio and never upscales a small source (I-55)", async () => {
    const { el } = await mount(makeRoot());
    const slider = q(el, "[data-testid='v2-thumb']") as HTMLInputElement;
    const row = q(el, `[data-testid='v2-row-${FOG}']`) as HTMLElement;
    const src = q(row, "[data-testid='v2-thumb-src'] img") as HTMLImageElement;
    const ai = q(row, "[data-testid='v2-thumb-ai'] img") as HTMLImageElement;
    await decode(src, 1600, 800); // a 2:1 original
    await decode(ai, 300, 300); // a small square result
    await slide(slider, "800");
    expect(box(row, "v2-thumb-src")).toEqual({ w: 1600, h: 800 }); // 800 px tall, its own 2:1 width
    expect(box(row, "v2-thumb-ai")).toEqual({ w: 300, h: 300 }); // a real box, never blown up
    // the whole range really moves both sides: the same rule at 48 px
    await slide(slider, "48");
    expect(box(row, "v2-thumb-src")).toEqual({ w: 96, h: 48 });
    expect(box(row, "v2-thumb-ai")).toEqual({ w: 48, h: 48 });
    // and the pair is ONE flex row of two independent slots — no overlap by
    // construction (each slot owns its real box; the CSS test pins the rest)
    const thumbs = row.querySelector(".pair-thumbs") as HTMLElement;
    expect([...thumbs.children].map((c) => (c as HTMLElement).dataset.testid))
      .toEqual(["v2-thumb-src", "v2-thumb-ai"]);
  });

  it("selects one, many, all visible and none again, with an indeterminate header", async () => {
    const { el } = await mount(makeRoot());
    const all = q(el, "[data-testid='v2-check-all']") as HTMLInputElement;
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("1 selected");
    expect(all.indeterminate).toBe(true);
    await click(q(el, "[data-testid='v2-select-visible']")!);
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("4 selected");
    expect(all.checked).toBe(true);
    expect(all.indeterminate).toBe(false);
    await check(q(el, `[data-testid='v2-check-${COURT}']`) as HTMLInputElement, false);
    expect(all.indeterminate).toBe(true);
    await click(q(el, "[data-testid='v2-deselect']")!);
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("0 selected");
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(false);
  });

  it("keeps selection across filter and sort changes, scoped to what is visible", async () => {
    const { el } = await mount(makeRoot());
    await selectByStatus(el, "approved"); // nothing approved yet -> no rows
    expect(rows(el).length).toBe(0);
    await selectByStatus(el, "all");
    await click(q(el, "[data-testid='v2-select-visible']")!); // 4 checked
    await selectByStatus(el, "declined"); // none declined -> 0 visible
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("4 selected");
    expect(text(el, "[data-testid='v2-hidden']")).toContain("4 checked but hidden");
    expect(text(el, "[data-testid='v2-scope']")).toBe("across 0 visible pairs");
    // sorting must not lose the checked rows or the active one
    await selectByStatus(el, "all");
    await choose(el, "[data-testid='v2-sort']", "name");
    await choose(el, "[data-testid='v2-dir']", "asc");
    expect(text(el, "[data-testid='v2-selected-count']")).toBe("4 selected");
    expect(rows(el).length).toBe(4);
  });

  it("approves the checked rows in one operation with one summary toast", async () => {
    const { el } = await mount(makeRoot());
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    await check(q(el, `[data-testid='v2-check-${COURT}']`) as HTMLInputElement, true);
    const btn = q(el, "[data-testid='v2-approve-selected']") as HTMLButtonElement;
    expect(btn.textContent).toBe("✓ Approve selected (2)");
    await click(btn);
    expect(btn.textContent).toBe("Confirm approve 2?"); // count shown before it applies
    await click(q(el, "[data-testid='v2-approve-selected']")!);
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
    expect(text(el, `[data-testid='v2-status-${COURT}']`)).toBe("✓ Approved");
    expect(text(el, "[data-testid='v2-toast']")).toBe("2 pairs approved");
    expect(text(el, "[data-testid='v2-count-approved']")).toContain("2");
  });

  it("declines the selected rows in one operation, and reports the blocked one", async () => {
    const { el } = await mount(makeRoot());
    await click(q(el, "[data-testid='v2-select-visible']")!);
    // the incomplete pair is checked but never in the bulk scope — said out loud
    expect(text(el, "[data-testid='v2-blocked']")).toBe("1 checked pair incomplete — never approved");
    const btn = q(el, "[data-testid='v2-decline-selected']") as HTMLButtonElement;
    expect(btn.textContent).toBe("✕ Decline selected (3)");
    await click(btn);
    await click(q(el, "[data-testid='v2-decline-selected']")!);
    expect(text(el, "[data-testid='v2-toast']")).toBe("3 pairs declined");
    expect(text(el, `[data-testid='v2-status-${DUNES}']`)).toContain("AI result missing");
  });

  it("keeps incomplete pairs out of the bulk scope and disarms with Escape", async () => {
    const { el } = await mount(makeRoot());
    const btn = q(el, "[data-testid='v2-approve-selected']") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await check(q(el, `[data-testid='v2-check-${DUNES}']`) as HTMLInputElement, true);
    expect(text(el, "[data-testid='v2-blocked']")).toContain("1 checked pair incomplete");
    expect(btn.textContent).toBe("✓ Approve selected (0)");
    expect(btn.disabled).toBe(true); // an incomplete pair is never eligible
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    expect(btn.textContent).toBe("✓ Approve selected (1)");
    await click(btn);
    expect(btn.textContent).toBe("Confirm approve 1?"); // count shown before it applies
    await key("Escape");
    expect(btn.textContent).toBe("✓ Approve selected (1)");
  });

  it("keeps a decision in memory when its OWN file cannot be written, and Retry writes exactly that pair", async () => {
    const root = makeRoot();
    const arch = root.children.get("architecture") as FakeDir;
    arch.children.set("fog_AI.svg.tmp.json", new BrokenFile("fog_AI.svg.tmp.json")); // this pair's write fails
    const { el } = await mount(root);
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    await click(q(el, "[data-testid='v2-approve-selected']")!);
    await click(q(el, "[data-testid='v2-approve-selected']")!);
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved"); // kept in memory
    expect(text(el, "[data-testid='v2-toast']")).toBe("1 pair approved · save failed — retry");
    expect(q(el, "[data-testid='v2-writewarn']")).toBeTruthy();
    expect(text(el, "[data-testid='sel-retry-count']")).toContain("awaiting retry");
    expect(arch.children.has("fog_AI.svg.json")).toBe(false); // nothing half-written
    arch.children.delete("fog_AI.svg.tmp.json"); // the folder becomes writable again
    await click(q(el, "[data-testid='v2-retry']")!);
    expect(q(el, "[data-testid='v2-writewarn']")).toBeNull();
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved");
  });

  it("reports an empty folder and a filter with no matches distinctly", async () => {
    const empty = new FakeDir("empty_root");
    const { el } = await mount(empty);
    expect(q(el, "[data-testid='v2-empty']")).toBeTruthy();
    const full = await mount(makeRoot());
    await selectByStatus(full.el, "approved");
    expect(q(full.el, "[data-testid='v2-nomatch']")).toBeTruthy();
    await click(q(full.el, "[data-testid='v2-clear-empty']")!);
    expect(rows(full.el).length).toBe(4);
    await act(async () => { full.ui.unmount(); });
  });

  it("warns about a corrupt legacy file without losing the review", async () => {
    const root = makeRoot();
    root.children.set(LEGACY_FILE, new FakeFile(LEGACY_FILE, 5, 1, "{oops"));
    const { el } = await mount(root);
    expect(q(el, "[data-testid='v2-corrupt']")).toBeTruthy();
    expect(rows(el).length).toBe(4);
  });

  it("names a pair file it could not read and keeps that pair's decision", async () => {
    const root = makeRoot();
    const arch = root.children.get("architecture") as FakeDir;
    arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 5, 1, "{oops"));
    const { el } = await mount(root);
    expect(text(el, "[data-testid='v2-pairfiles']")).toContain("fog_AI.svg.json");
    expect(rows(el).length).toBe(4); // the pair is still listed, with its reason
  });

  it("approve → ONE file per pair, no review-decisions.json anywhere", async () => {
    const root = makeRoot();
    const { el } = await mount(root);
    await check(q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement, true);
    await click(q(el, "[data-testid='v2-approve-selected']")!);
    await click(q(el, "[data-testid='v2-approve-selected']")!);
    const arch = root.children.get("architecture") as FakeDir;
    const written = parsePairMeta((arch.children.get("fog_AI.svg.json") as FakeFile).text);
    expect(written.ok && written.meta).toMatchObject({ decision: "approved", base: "fog", suffix: "", dirPath: "architecture" });
    expect(root.children.has(LEGACY_FILE)).toBe(false);
    expect(arch.children.has("fog.svg.json")).toBe(false);
  });

  it("rescan keeps decisions, adds new pairs pending and preserves the zoom", async () => {
    const root = makeRoot();
    const { el } = await mount(root);
    await slide(q(el, "[data-testid='v2-thumb']") as HTMLInputElement, "160");
    await click(q(el, `[data-testid='v2-row-${FOG}']`)!);
    await key("a");
    const coast = root.children.get("coastal") as FakeDir;
    coast.children.set("tide.png", new FakeFile("tide.png", 12, 900, "h"));
    coast.children.set("tide_AI.png", new FakeFile("tide_AI.png", 20, 950, "i"));
    (root.children.get("architecture") as FakeDir).children.delete("court.png");
    (root.children.get("architecture") as FakeDir).children.delete("court_AI.png");
    await click(q(el, "[data-testid='v2-rescan']")!);
    const tide = pairId("coastal", "tide", "");
    expect(text(el, `[data-testid='v2-status-${FOG}']`)).toBe("✓ Approved"); // decision survived
    expect(text(el, `[data-testid='v2-status-${tide}']`)).toBe("◔ Pending"); // new pair starts pending
    expect(q(el, `[data-testid='v2-row-${COURT}']`)).toBeNull(); // removed pair is gone
    expect(text(el, "[data-testid='sel-diff']")).toContain("+1 new");
    expect(text(el, "[data-testid='sel-diff']")).toContain("1 removed");
    expect(text(el, "[data-testid='v2-thumb-value']")).toBe("160 px"); // zoom preserved
  });

  it("restores decisions from the decision file on a fresh mount", async () => {
    const root = makeRoot();
    const first = await mount(root);
    await click(q(first.el, `[data-testid='v2-row-${HARBOR}']`)!);
    await key("a");
    await act(async () => { first.ui.unmount(); });
    const second = await mount(root);
    expect(text(second.el, `[data-testid='v2-status-${HARBOR}']`)).toBe("✓ Approved");
    expect(text(second.el, "[data-testid='v2-count-approved']")).toContain("1");
    await act(async () => { second.ui.unmount(); });
  });

  it("labels the review controls for keyboard and screen-reader users", async () => {
    const { el } = await mount(makeRoot());
    expect((q(el, `[data-testid='v2-check-${FOG}']`) as HTMLInputElement).getAttribute("aria-label")).toBe("Select fog");
    expect(q(el, "[data-testid='v2-approve-selected']")?.getAttribute("aria-label")).toBe("Approve selected — 0 pairs");
    expect(q(el, "[data-testid='v2-decline-selected']")?.getAttribute("aria-label")).toBe("Decline selected — 0 pairs");
    expect(q(el, "[data-testid='v2-reset-selected']")?.getAttribute("aria-label")).toBe("Reset selected to pending — 0 pairs");
    expect(q(el, "[data-testid='v2-check-all']")?.getAttribute("aria-label")).toBe("Select all visible image pairs");
    expect(q(el, "[data-testid='v2-rows']")?.getAttribute("aria-label")).toBe("Image review pairs");
    expect(q(el, "[data-testid='v2-list'] kbd")?.textContent).toBe("A");
  });
});

describe("the folder control of Selection V2 (I-44/I-45/I-46)", () => {
  beforeEach(async () => {
    localStorage.clear();
    resetAppStore();
    clearKnownRoots();
    await dropDb();
  });

  it("is one green \"Open folder\" button — no name pill, no path field, no copied-path button", async () => {
    const { el } = await mount(makeRoot());
    const btn = q(el, "[data-testid='v2-open-folder']") as HTMLButtonElement;
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.textContent).toBe("Open folder");
    expect(btn.className).toContain("folder-open");
    expect(btn.disabled).toBe(false);
    // the folder's NAME is never the button any more, and nothing else offers
    // to write the remembered path: that memory is only ever captured at pick
    // time (I-45).
    expect(q(el, "[data-testid='v2-root']")).toBeNull();
    expect(q(el, "[data-testid='v2-root-path']")).toBeNull();
    expect(q(el, "[data-testid='v2-root-path-use']")).toBeNull();
    expect(q(el, "[data-testid='v2-root-path-note']")).toBeNull();
    expect(el.textContent).not.toContain("Use copied path");
    expect(el.textContent).not.toContain("FULL PATH FOR COPIES");
    expect(el.textContent).not.toContain("Full path for copies");
  });

  it("reviews the batch's output folder when that folder IS the picked root (I-47)", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: async () => "F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output",
        writeText: async (t: string) => { written.push(t); },
      }, configurable: true,
    });
    const out = makeBatchRoot().children.get("_split_output") as FakeDir;
    const { el } = await mount(out);
    // the reported pick: the piece below the output folder is reviewable…
    expect(rows(el).length).toBe(1);
    // …and nothing is claimed to be sitting "in the main folder" (RULE 4)
    expect(text(el, "[data-testid='v2-scan-scope']")).toContain("Scope: split output only");
    expect(text(el, "[data-testid='v2-scan-scope']")).not.toContain("not listed");
    expect(text(el, "[data-testid='v2-folder-path']")).toContain("_split_output");
    // A copy hands over the folder of the FILE it was made from (I-56) — here
    // the split folder the reference image sits in, never the run folder above it.
    const id = rows(el)[0].getAttribute("data-testid")?.replace("v2-row-", "") ?? "";
    await click(q(el, `[data-testid='v2-open-src-${id}']`)!);
    expect(written[0]).toBe("F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output\\2026-10\\2026-10-01_10-24-31\\icon-sheet_AI\\split_01");
  });

  it("shows the exact full path of a pick inside a folder picked before (I-51)", async () => {
    // first pick: the batch's output folder, its real path on the clipboard
    stubClipboard("F:\\Stocks 2026\\icons testing\\single\\test_processing_2\\_split_output");
    const root = makeBatchRoot();
    const out = root.children.get("_split_output") as FakeDir;
    const { el } = await mount(out);
    expect(text(el, "[data-testid='v2-folder-path']")).toContain("test_processing_2\\_split_output");
    // second pick: the run folder INSIDE it, with the clipboard saying nothing
    stubClipboard("");
    const run = (out.children.get("2026-10") as FakeDir).children.get("2026-10-01_10-24-31") as FakeDir;
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(run);
    await click(q(el, "[data-testid='v2-open-folder']")!);
    const row = text(el, "[data-testid='v2-folder-path']");
    expect(row).toContain("test_processing_2\\_split_output\\2026-10\\2026-10-01_10-24-31");
    expect(row).not.toContain("not captured");
    expect(rows(el).length).toBe(1); // and the run's own pair is listed
  });

  it("shows the same green Open folder button in the empty state", async () => {
    (window as unknown as PickerWindow).showDirectoryPicker = () => Promise.resolve(makeRoot());
    const el = document.createElement("div");
    document.body.appendChild(el);
    const ui = createRoot(el);
    await act(async () => { ui.render(<HistoryProvider><PrefsHost><SelectionV2Panel /></PrefsHost></HistoryProvider>); });
    const empty = q(el, "[data-testid='v2-open-folder-empty']") as HTMLButtonElement;
    expect(empty).not.toBeNull();
    expect(empty.textContent).toBe("Open folder");
    expect(empty.className).toContain("folder-open");
    expect(empty.closest("[data-testid='v2-root-empty']")).not.toBeNull();
    // and no path row while there is no folder to name (RULE 4)
    expect(q(el, "[data-testid='v2-folder-path']")).toBeNull();
    await act(async () => { ui.unmount(); });
  });

  it("keeps the complete path visible in a full-width read-only row below the controls", async () => {
    const { el } = await mount(makeRoot(), "F:\\Stocks 2026\\icons\\split_root");
    const row = q(el, "[data-testid='v2-folder-path']")!;
    expect(row.parentElement?.className).toContain("v2-controls"); // below the toolbar
    expect(nearestToolbar(row)).toBe(true);
    expect(row.textContent).toContain("F:\\Stocks 2026\\icons\\split_root");
    expect(row.querySelector("input, textarea, button")).toBeNull();
  });

  it("has no Watcher left: nothing ticks a rescan by itself", async () => {
    const { el } = await mount(makeRoot());
    expect(q(el, "[data-testid='v2-watcher']")).toBeNull();
    expect(el.textContent).not.toContain("Watcher");
    expect(selectionSources()).not.toMatch(/watcher/i);
    // the hook that owned the scan timer ticks nothing any more; the only
    // interval left in the selection modules is the footer's "N seconds ago"
    // display clock (StatusFooter), which never scans (RULE 13)
    expect(readFileSync(join(process.cwd(), "src/selection/useSelection.ts"), "utf8"))
      .not.toContain("setInterval");
  });

  it("re-opens the picker from the same button with a root already loaded", async () => {
    const { el, pick } = await mount(makeRoot());
    expect(pick).toHaveBeenCalledTimes(1);
    await click(q(el, "[data-testid='v2-open-folder']")!); // the same button, again
    expect(pick).toHaveBeenCalledTimes(2); // the tab can be pointed again by hand
    expect(rows(el).length).toBeGreaterThan(0);
  });
});

/** The row must sit directly under the toolbar: nothing but the toolbar above it. */
function nearestToolbar(row: HTMLElement): boolean {
  const parent = row.parentElement;
  return parent?.firstElementChild?.className.includes("v2-toolbar") ?? false;
}

/** Every Selection module's source, so a removed timer cannot come back unseen. */
function selectionSources(): string {
  const dirs = ["src/selection", "src/selectionv2"];
  return dirs.flatMap((dir) => readdirSync(join(process.cwd(), dir))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => readFileSync(join(process.cwd(), dir, f), "utf8"))).join("\n");
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

/** Prefs persistence lives above the tabs (Workbench mounts it); mirror that here. */
function PrefsHost({ children }: { children: ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

/** `copied` is what Explorer left on the clipboard for the pick-time capture. */
async function mount(root: FakeDir, copied = ""): Promise<{ el: HTMLElement; ui: Root; pick: ReturnType<typeof vi.fn> }> {
  if (copied !== "") stubClipboard(copied);
  const pick = vi.fn(async () => root);
  (window as unknown as PickerWindow).showDirectoryPicker = pick;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ui = createRoot(el);
  await act(async () => { ui.render(<HistoryProvider><PrefsHost><SelectionV2Panel /></PrefsHost></HistoryProvider>); });
  await click(q(el, "[data-testid='v2-open-folder']")!);
  return { el, ui, pick };
}

function q(el: HTMLElement, sel: string): HTMLElement | null {
  return el.querySelector(sel);
}

function stubClipboard(value: string): void {
  Object.defineProperty(navigator, "clipboard", {
    value: { readText: async () => value, writeText: async () => undefined }, configurable: true,
  });
}

function rows(el: HTMLElement): Element[] {
  return [...el.querySelectorAll("[data-testid^='v2-row-']")];
}

function text(el: HTMLElement, sel: string): string {
  return q(el, sel)?.textContent ?? "";
}

async function click(node: HTMLElement): Promise<void> {
  await act(async () => { node.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await settle();
}

async function key(k: string): Promise<void> {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
  await settle();
}

/** React fires a checkbox onChange from the click event, so click it for real. */
async function check(box: HTMLInputElement, on: boolean): Promise<void> {
  await act(async () => {
    if (box.checked !== on) box.click();
  });
  await settle();
}

/** jsdom never decodes an image: give it real pixels and fire its load event. */
async function decode(img: HTMLImageElement, w: number, h: number): Promise<void> {
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
  await act(async () => { img.dispatchEvent(new Event("load")); });
}

/** The px box a preview slot was given — what the browser will lay out. */
function box(scope: HTMLElement, testid: string): { w: number; h: number } {
  const el = q(scope, `[data-testid='${testid}']`) as HTMLElement;
  return { w: parseInt(el.style.width, 10), h: parseInt(el.style.height, 10) };
}

async function slide(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    nativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

async function choose(select: HTMLElement, sel: string, value: string): Promise<void> {
  const el = q(select, sel) as HTMLSelectElement;
  await act(async () => {
    nativeValue(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

const selectByStatus = (el: HTMLElement, v: string) => choose(el, "[data-testid='v2-status']", v);

/** React tracks input values, so the native setter must be used to change one. */
function nativeValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}


