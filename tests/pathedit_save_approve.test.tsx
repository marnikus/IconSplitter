// pathedit_save_approve.test.tsx — Ctrl+Shift+S in the edit mode is "save,
// approve & next" (2026-11-06): it saves the edit (when something changed),
// marks the SVG approved in Generate SVG — even when there was nothing to
// change — and opens the next SVG. The approval is its own undo step (the
// review's svgReview entry). The leave question's "Save and go" stays save-only.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EDIT_HOTKEYS } from "../src/svg/pathedit/hotkeys";
import SvgPathEditor, { type EditNav } from "../src/svg/pathedit/SvgPathEditor";

const applied = vi.hoisted(() => ({ recs: [] as unknown[] }));
vi.mock("../src/svg/reviewundo", async (orig) => {
  const actual = await orig<typeof import("../src/svg/reviewundo")>();
  return { ...actual, applySvgReviewPatch: vi.fn(async (p: { recs: unknown[] }) => { applied.recs.push(...p.recs); return true; }) };
});
import { approveEditedSvg, useSvgEditBinding } from "../src/svg/svgedit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCALE = 10;
const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });
const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
  .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype).filter((p): p is object => p !== undefined);

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => {
  applied.recs = [];
  for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
  host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
});
afterEach(() => { act(() => ui.unmount()); host.remove(); for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM; });

const SRC = '<svg viewBox="0 0 24 24"><path d="M2 2L12 2L12 12"/></svg>';
const key = (k: string, mods: KeyboardEventInit = {}) => new KeyboardEvent("keydown", { key: k, bubbles: true, ...mods });
const pointer = (t: EventTarget, type: string, x: number, y: number) =>
  t.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1 }));

async function mount() {
  const onGo = vi.fn();
  const nav: EditNav = { canPrev: true, canNext: true, position: "1 / 2", onGo };
  await act(async () => { ui.render(<SvgPathEditor source={SRC} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={vi.fn()} onCancel={vi.fn()} nav={nav} />); });
  return onGo;
}

describe("Ctrl+Shift+S = save, approve & next", () => {
  it("with changes: hands over the rewritten file and asks to approve", async () => {
    const onGo = await mount();
    const node = host.querySelector("[data-testid=e]") as HTMLElement;
    await act(async () => { pointer(node, "pointerdown", 12, 2); pointer(node, "pointermove", 14, 4); pointer(node, "pointerup", 14, 4); });
    await act(async () => { window.dispatchEvent(key("S", { ctrlKey: true, shiftKey: true })); });
    expect(onGo).toHaveBeenLastCalledWith(1, expect.stringContaining('d="M2 2L14 4L12 12"'), true);
  });

  it("with nothing changed it still approves and goes on", async () => {
    const onGo = await mount();
    await act(async () => { window.dispatchEvent(key("S", { ctrlKey: true, shiftKey: true })); });
    expect(onGo).toHaveBeenLastCalledWith(1, null, true);
  });

  it("the leave question's Save and go does not approve", async () => {
    const onGo = await mount();
    const node = host.querySelector("[data-testid=e]") as HTMLElement;
    await act(async () => { pointer(node, "pointerdown", 12, 2); pointer(node, "pointermove", 14, 4); pointer(node, "pointerup", 14, 4); });
    await act(async () => { window.dispatchEvent(key("ArrowRight")); });
    await act(async () => { (host.querySelector("[data-testid=e-leave-save]") as HTMLButtonElement).click(); });
    expect(onGo.mock.calls.at(-1)?.[2] ?? false).toBe(false);
  });

  it("the legend says so", () => {
    expect(EDIT_HOTKEYS.find((h) => h.keys === "Ctrl+Shift+S")?.text).toBe("Save, approve & next SVG");
  });
});

describe("the approval", () => {
  function Bind({ push }: { push: (e: unknown) => void }) { useSvgEditBinding({ current: null }, { push: push as never }); return null; }

  it("marks the item approved and records its own svgReview undo step", async () => {
    const push = vi.fn();
    await act(async () => { ui.render(<Bind push={push} />); });
    await expect(approveEditedSvg("r1", "pending", "icon SVG v2")).resolves.toBe(true);
    expect(applied.recs).toEqual([{ id: "r1", review: "approved" }]);
    expect(push).toHaveBeenCalledWith(expect.objectContaining({
      type: "svgReview", ids: ["r1"], before: { recs: [{ id: "r1", review: "pending" }] }, after: { recs: [{ id: "r1", review: "approved" }] },
    }));
  });

  it("an item that is already approved records nothing", async () => {
    const push = vi.fn();
    await act(async () => { ui.render(<Bind push={push} />); });
    await expect(approveEditedSvg("r1", "approved", "x")).resolves.toBe(true);
    expect(push).not.toHaveBeenCalled();
  });
});
