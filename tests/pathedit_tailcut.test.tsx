// pathedit_tailcut.test.tsx — the tail cutter inside the full-screen edit mode
// (2026-11-09): Hide highlights, Cutter algo and Cut tails sit in the top bar;
// Ctrl+J highlights every tail to cut in the open artwork, Ctrl+L applies that
// cut (to the artboard — Finish edit writes it, Cancel drops it).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cutTails, findTails } from "../src/lib/tailcut";
import { EDIT_HOTKEYS, modalKeyAction } from "../src/svg/pathedit/hotkeys";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";
import { forgetCutSettings, setCutSettings } from "../src/svg/tailcut/cutsettings";
import { setTailMarksHidden } from "../src/svg/tailcut/tailreview";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const key = (k: string, mods: Partial<KeyboardEventInit> = {}) => new KeyboardEvent("keydown", { key: k, bubbles: true, ...mods });
const SRC = '<svg viewBox="0 0 100 100"><path d="M0 50L100 50"/><path d="M40 10L40 55"/></svg>';
const CLEAN = '<svg viewBox="0 0 100 100"><path d="M0 50L100 50"/><path d="M40 10L40 40"/></svg>';
const CUT = cutTails(SRC, findTails(SRC, 10)) as string;

describe("the cutter's keys", () => {
  it("Ctrl+J highlights, Ctrl+L applies; both are in the legend", () => {
    expect(modalKeyAction(key("j", { ctrlKey: true }))).toBe("cut-highlight");
    expect(modalKeyAction(key("L", { ctrlKey: true }))).toBe("cut-apply");
    expect(modalKeyAction(key("j", { ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(modalKeyAction(key("j"))).toBeNull();
    const keys = EDIT_HOTKEYS.map((h) => h.keys);
    expect(keys).toContain("Ctrl+J");
    expect(keys).toContain("Ctrl+L");
  });
});

describe("the cutter in the edit surface", () => {
  const SCALE = 10;
  const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });
  const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
    .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype).filter((p): p is object => p !== undefined);
  let host: HTMLDivElement;
  let ui: Root;
  let onFinish: ReturnType<typeof vi.fn<(markup: string) => void>>;
  beforeEach(() => {
    localStorage.clear();
    forgetCutSettings();
    setTailMarksHidden(false);
    for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
    host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
    onFinish = vi.fn<(markup: string) => void>();
  });
  afterEach(() => { act(() => ui.unmount()); host.remove(); for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM; });
  const q = (sel: string) => host.querySelector<HTMLElement>(sel);
  const marks = () => q("[data-testid=e]")?.shadowRoot?.querySelectorAll("[data-tail-mark] rect").length ?? 0;
  const press = (k: string, mods: Partial<KeyboardEventInit> = { ctrlKey: true }) => act(async () => { window.dispatchEvent(key(k, mods)); });
  const click = (sel: string) => act(async () => { q(sel)?.click(); });
  const mount = (source = SRC) => act(async () => {
    ui.render(<SvgPathEditor source={source} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={onFinish} onCancel={vi.fn()} />);
  });

  it("has Hide highlights, Cutter algo and Cut tails in the top bar", async () => {
    await mount();
    for (const id of ["e-cut-hide", "e-cut-settings", "e-cut-run"]) expect(q(`[data-testid=${id}]`)).not.toBeNull();
    expect(q("[data-testid=e-toolbar]")?.contains(q("[data-testid=e-cut-run]"))).toBe(true);
  });

  it("Ctrl+J highlights every tail in the open artwork, and says how many", async () => {
    await mount();
    expect(marks()).toBe(0);
    await press("j");
    expect(marks()).toBe(1);
    expect(q("[data-testid=e-cut-note]")?.textContent).toContain("1 tail");
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(true); // nothing is cut yet
  });

  it("marks only the end of the line with a rect and overlays the tail, up to the crossing, in the same line", async () => {
    await mount();
    await press("j");
    const root = q("[data-testid=e]")?.shadowRoot;
    const rect = root?.querySelector("[data-tail-mark] rect");
    const x = Number(rect?.getAttribute("x")), w = Number(rect?.getAttribute("width"));
    const y = Number(rect?.getAttribute("y")), h = Number(rect?.getAttribute("height"));
    expect([x + w / 2, y + h / 2]).toEqual([40, 55]); // centred on the open end, not on the whole tail
    expect(w).toBeLessThan(5);
    const line = root?.querySelector("[data-tail-mark] path");
    expect(line?.getAttribute("d")).toBe("M40 55L40 50"); // the end → the crossing
    expect(line?.getAttribute("style")).toContain("fill:none");
    expect(root?.querySelectorAll("[data-tail-mark] path")).toHaveLength(1);
  });

  it("neither the rect nor the red tail is part of the file Finish writes", async () => {
    await mount();
    await press("j");
    await press("l");
    expect(onFinish).not.toHaveBeenCalled();
    await click("[data-testid=e-finish]");
    expect(onFinish.mock.calls[0][0]).not.toContain("data-tail-mark");
    expect(onFinish.mock.calls[0][0]).not.toContain("<rect");
  });

  it("Hide highlights hides the boxes, Ctrl+J shows them again", async () => {
    await mount();
    await press("j");
    await click("[data-testid=e-cut-hide]");
    expect(marks()).toBe(0);
    await press("j");
    expect(marks()).toBe(1);
  });

  it("Ctrl+L applies the highlighted cut: the artwork changes and Finish edit writes it", async () => {
    await mount();
    await press("j");
    await press("l");
    expect(marks()).toBe(0);
    expect(q("[data-testid=e-cut-note]")?.textContent).toContain("Cut 1 tail");
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(false);
    await click("[data-testid=e-finish]");
    expect(onFinish).toHaveBeenCalledWith(CUT);
  });

  it("an applied cut is in the history: Ctrl+Z puts the tail back (highlighted again), Ctrl+Shift+Z redoes the cut", async () => {
    await mount();
    await press("j");
    await press("l");
    expect(marks()).toBe(0);
    await press("z");
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(true); // back to the original artwork
    expect(marks()).toBe(1); // the tail is highlighted again: ready to cut once more
    await press("z", { ctrlKey: true, shiftKey: true });
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(false);
    expect(marks()).toBe(0);
    await click("[data-testid=e-finish]");
    expect(onFinish).toHaveBeenCalledWith(CUT);
  });

  it("a cut of several tails is one undo step", async () => {
    const two = '<svg viewBox="0 0 100 100"><path d="M0 50L100 50"/><path d="M40 10L40 55"/><path d="M70 90L70 45"/></svg>';
    await mount(two);
    await press("j");
    expect(q("[data-testid=e-cut-note]")?.textContent).toContain("2 tails");
    await press("l");
    expect(q("[data-testid=e-cut-note]")?.textContent).toContain("Cut 2 tails");
    await press("z");
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(true); // both tails back with one Ctrl+Z
    await press("z");
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(true); // nothing older to undo
  });

  it("an Apply button sits beside Cut tails: off until tails are highlighted, then it cuts them like Ctrl+L", async () => {
    await mount();
    const apply = () => q("[data-testid=e-cut-apply]") as HTMLButtonElement;
    expect(apply()).not.toBeNull();
    expect(apply().disabled).toBe(true);
    expect(q("[data-testid=e-cut-run]")?.nextElementSibling).toBe(apply());
    await click("[data-testid=e-cut-run]");
    expect(apply().disabled).toBe(false);
    expect(apply().textContent).toContain("Apply");
    expect(apply().textContent).toContain("1");
    await click("[data-testid=e-cut-apply]");
    expect(marks()).toBe(0);
    expect(apply().disabled).toBe(true); // nothing left to apply
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(false);
    await click("[data-testid=e-finish]");
    expect(onFinish).toHaveBeenCalledWith(CUT);
  });

  it("Apply goes off again when an edit makes the highlight stale", async () => {
    await mount();
    await press("j");
    expect((q("[data-testid=e-cut-apply]") as HTMLButtonElement).disabled).toBe(false);
    await press("l");
    await press("z"); // the cut is undone: the tail is highlighted again, Apply is back
    expect((q("[data-testid=e-cut-apply]") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Ctrl+L with nothing highlighted cuts nothing and says what to do", async () => {
    await mount();
    await press("l");
    expect(q("[data-testid=e-cut-note]")?.textContent).toContain("Ctrl+J");
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(true);
  });

  it("an artwork without tails says so", async () => {
    await mount(CLEAN);
    await press("j");
    expect(marks()).toBe(0);
    expect(q("[data-testid=e-cut-note]")?.textContent).toContain("No tails");
  });

  it("Cut tails highlights first; with Cut automatically it cuts at once", async () => {
    await mount();
    await click("[data-testid=e-cut-run]");
    expect(marks()).toBe(1);
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(true);
    setCutSettings({ auto: true });
    await click("[data-testid=e-cut-run]");
    expect(q("[data-testid=e-finish]")?.hasAttribute("disabled")).toBe(false);
  });

  it("the Cutter algo popup opens in the edit surface", async () => {
    await mount();
    await click("[data-testid=e-cut-settings]");
    expect(q("[data-testid=e-cut-settings-dialog]")).not.toBeNull();
  });
});
