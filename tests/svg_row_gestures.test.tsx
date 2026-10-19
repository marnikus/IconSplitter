// Batch-authoritative row gestures through the real Generate SVG panel and global history.
// No generation request is confirmed; fetch is intercepted so no provider is contacted.
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { getAppState, patchUpload } from "../src/state/appstore";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import {
  installSvgPanelHooks, COURT, FOG, makeRoot, mount, q, settle,
} from "./helpers/svgpanel";

installSvgPanelHooks();

const ARCH = pairId("architecture", "arch", "");
const ZEN = pairId("architecture", "zen", "");
const IDS = [ARCH, COURT, FOG, ZEN];
type Modifiers = Pick<MouseEventInit, "shiftKey" | "ctrlKey" | "altKey" | "metaKey">;
type GestureState = { checked: string[]; active: string | null; anchor: string | null | undefined };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ object: "list", data: [] }), { status: 200 })));
});

async function fourSources(): Promise<FakeDir> {
  const root = await makeRoot();
  const arch = root.children.get("architecture") as FakeDir;
  const decisions = JSON.parse((root.children.get("review-decisions.json") as FakeFile).text) as { records: object[] };
  for (const [name, id] of [["arch", ARCH], ["zen", ZEN]] as const) {
    arch.children.set(`${name}.png`, new FakeFile(`${name}.png`, 12, 2000, "reference"));
    arch.children.set(`${name}_AI.png`, new FakeFile(`${name}_AI.png`, 20, 2100, "result"));
    decisions.records.push({ pair_id: id, source: `architecture/${name}.png`, ai_result: `architecture/${name}_AI.png`,
      decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" });
  }
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify(decisions)));
  return root;
}

const row = (id: string) => q(`[data-testid=svg-row-${id}]`) as HTMLElement;
const visibleIds = () => [...(q("[data-testid=svg-rows]") as HTMLElement).querySelectorAll<HTMLElement>("[data-testid^=svg-row-pair_]")]
  .map((el) => el.dataset.testid!.replace("svg-row-", ""));
const checkedIds = () => IDS.filter((id) => getAppState().svg.checked.includes(id));
const anchor = () => (getAppState().svg as { anchorId?: string | null }).anchorId;
const state = (): GestureState => ({ checked: checkedIds(), active: getAppState().svg.activeId, anchor: anchor() });

async function clickRow(id: string, modifiers: Modifiers = {}): Promise<void> {
  await act(async () => { row(id).dispatchEvent(new MouseEvent("click", { bubbles: true, ...modifiers })); });
  await settle();
}
async function click(sel: string): Promise<void> {
  await act(async () => { (q(`[data-testid=${sel}]`) as HTMLElement).click(); });
  await settle();
}
async function key(name: string): Promise<void> {
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true })); });
  await settle();
}
async function choose(testId: string, value: string): Promise<void> {
  await act(async () => {
    const el = q(`[data-testid=${testId}]`) as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

// The checked set and active row must be independent, including a checkbox click bubbling inside a row.
describe("Generate SVG row selection", () => {
  it("plain row click moves only the active row/anchor; checkbox changes only its check", async () => {
    await mount(await fourSources());
    await choose("svg-sort", "name");
    await click("svg-check-" + FOG);
    expect(checkedIds()).toEqual([FOG]);
    expect(getAppState().svg.activeId).toBeNull();
    await clickRow(COURT);
    expect(state()).toEqual({ checked: [FOG], active: COURT, anchor: COURT });
    expect(row(COURT).getAttribute("aria-current")).toBe("true");
    await click("svg-check-" + ARCH);
    expect(state()).toEqual({ checked: [ARCH, FOG], active: COURT, anchor: COURT });
    await clickRow(ZEN);
    expect(state()).toEqual({ checked: [ARCH, FOG], active: ZEN, anchor: ZEN });
  });

  it("Shift checks the inclusive range in visible sorted order, not discovery order", async () => {
    await mount(await fourSources());
    await choose("svg-sort", "name");
    expect(visibleIds()).toEqual([ARCH, COURT, FOG, ZEN]);
    await clickRow(ZEN);
    await clickRow(COURT, { shiftKey: true });
    expect(checkedIds()).toEqual([COURT, FOG, ZEN]);
    expect(state().active).toBe(COURT);
    expect(state().anchor).toBe(COURT);
    await choose("svg-filter-generation", "not-generated"); // FOG vanishes; range must not include it
    expect(visibleIds()).toEqual([ARCH, COURT, ZEN]);
    await clickRow(ZEN, { shiftKey: true });
    expect(checkedIds()).toEqual([COURT, ZEN]);
  });

  it.each(["ctrlKey", "altKey", "metaKey"] as const)("%s toggles one row without moving the Shift anchor", async (modifier) => {
    await mount(await fourSources());
    await choose("svg-sort", "name");
    await clickRow(ARCH);
    await clickRow(ZEN, { [modifier]: true });
    expect(state()).toEqual({ checked: [ZEN], active: ZEN, anchor: ARCH });
    await clickRow(ZEN, { [modifier]: true });
    expect(state()).toEqual({ checked: [], active: ZEN, anchor: ARCH });
    await clickRow(COURT, { shiftKey: true });
    expect(checkedIds()).toEqual([ARCH, COURT]); // range still starts at ARCH
  });

  it("header off unchecks only visible rows, preserving checked rows hidden by a filter", async () => {
    await mount(await fourSources());
    await click("svg-check-" + FOG);
    await choose("svg-filter-generation", "not-generated");
    expect(visibleIds()).toEqual(expect.arrayContaining([ARCH, COURT, ZEN]));
    await click("svg-check-all");
    expect((q("[data-testid=svg-check-all]") as HTMLInputElement).checked).toBe(true);
    await click("svg-check-all");
    await choose("svg-filter-generation", "all");
    expect(checkedIds()).toEqual([FOG]);
  });

  it("E/Q affect only the active row, falling back to select-visible/deselect-all with no active row", async () => {
    await mount(await fourSources());
    await choose("svg-sort", "name");
    await key("e");
    expect(checkedIds()).toEqual(IDS);
    await key("q");
    expect(checkedIds()).toEqual([]);
    await click("svg-check-" + COURT);
    await clickRow(FOG);
    await key("e");
    expect(checkedIds()).toEqual([COURT, FOG]);
    await key("q");
    expect(checkedIds()).toEqual([COURT]);
    expect(state().active).toBe(FOG);
  });

  it("A/D review only a valid active SVG; an empty row cannot be reviewed", async () => {
    await mount(await fourSources());
    await clickRow(COURT); // no generated SVG
    await key("a");
    await key("d");
    await key("w");
    expect(q(`[data-testid=svg-review-${COURT}]`)?.textContent).toContain("Pending");
    await clickRow(FOG);
    await key("a");
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("Approved");
    await key("d");
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("Declined");
    await key("w");
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("new review");
    expect(q(`[data-testid=svg-review-${COURT}]`)?.textContent).toContain("Pending");
  });

  it("blocks Q/E, Space and review shortcuts behind the code dialog, then restores them on close", async () => {
    await mount(await fourSources());
    await clickRow(FOG);
    await click("svg-code-" + FOG);
    expect(q("[data-testid=svg-code-dialog]")).not.toBeNull();
    await key("e");
    await key(" ");
    await key("a");
    expect(checkedIds()).toEqual([]);
    expect(q(`[data-testid=svg-review-${FOG}]`)?.textContent).toContain("Pending");
    await key("Escape");
    expect(q("[data-testid=svg-code-dialog]")).toBeNull();
    await key("e");
    expect(checkedIds()).toEqual([FOG]);
  });

  it("undo/redo restores its own checked, active and anchor snapshot without touching Upload", async () => {
    await mount(await fourSources());
    await act(async () => { patchUpload({ checked: ["upload-sentinel"], activeId: "upload-sentinel", anchorId: "upload-sentinel" } as Parameters<typeof patchUpload>[0]); });
    const other = getAppState().upload;
    await clickRow(ARCH);
    const before = state();
    expect(before).toEqual({ checked: [], active: ARCH, anchor: ARCH });
    await clickRow(FOG, { ctrlKey: true });
    const after = state();
    expect(after).toEqual({ checked: [FOG], active: FOG, anchor: ARCH });
    await click("hist-undo");
    expect(state()).toEqual(before);
    expect(getAppState().upload).toEqual(other);
    await click("hist-redo");
    expect(state()).toEqual(after);
    expect(getAppState().upload).toEqual(other);
  });
});
