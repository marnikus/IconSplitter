// pathedit_nudge.test.tsx — the arrow keys nudge the selected points in the
// edit mode (2026-11-06): 1 icon unit per press, Shift = 10; a quick burst of
// presses is ONE undo step. With nothing selected, ← / → still go to the
// previous / next SVG.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editorState, keyDown, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData } from "../src/lib/pathedit/model";
import { newSession } from "../src/lib/pathedit/session";
import { EDIT_HOTKEYS } from "../src/svg/pathedit/hotkeys";
import SvgPathEditor, { type EditNav } from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const at = (x: number, y: number): PointerInput => ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 0.1, target: null });
const selected = (): EditorState => {
  const st = editorState(newSession(fromPathData("M0 0L10 0L10 10")));
  return pointerUp(pointerMove(pointerDown(st, at(-2, -2)), at(12, 2))); // the two top points
};
const press = (st: EditorState, key: string, shift = false) => keyDown(st, { key, ctrl: false, shift });

describe("nudging", () => {
  it("each arrow moves the selected points 1 unit; Shift moves 10", () => {
    let st = press(selected(), "ArrowRight");
    st = press(st.state, "ArrowDown");
    expect(toPathData(st.state.session.model)).toBe("M1 1L11 1L10 10");
    expect(st.handled).toBe(true);
    st = press(st.state, "ArrowLeft", true);
    st = press(st.state, "ArrowUp", true);
    expect(toPathData(st.state.session.model)).toBe("M-9 -9L1 -9L10 10");
  });

  it("a quick burst of presses is one undo step", () => {
    let st = selected();
    for (let i = 0; i < 5; i++) st = press(st, "ArrowRight").state;
    expect(st.session.undo).toHaveLength(1);
    st = keyDown(st, { key: "z", ctrl: true, shift: false }).state;
    expect(toPathData(st.session.model)).toBe("M0 0L10 0L10 10");
  });

  it("with nothing selected the arrows are not used by the session", () => {
    const st = editorState(newSession(fromPathData("M0 0L10 0")));
    expect(press(st, "ArrowRight").handled).toBe(false);
  });

  it("the legend says so", () => {
    expect(EDIT_HOTKEYS.some((h) => /Arrows/.test(h.keys) && /Shift 10/.test(h.text))).toBe(true);
  });
});

describe("in the edit mode", () => {
  const SCALE = 10;
  const ctm = () => ({ a: SCALE, b: 0, c: 0, d: SCALE, e: 0, f: 0, inverse: () => ({ a: 1 / SCALE, b: 0, c: 0, d: 1 / SCALE, e: 0, f: 0 }) });
  const protos = () => ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
    .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype).filter((p): p is object => p !== undefined);
  let host: HTMLDivElement;
  let ui: Root;
  beforeEach(() => {
    for (const p of protos()) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
    host = document.createElement("div"); document.body.append(host); ui = createRoot(host);
  });
  afterEach(() => { act(() => ui.unmount()); host.remove(); for (const p of protos()) delete (p as { getScreenCTM?: unknown }).getScreenCTM; });

  it("→ nudges a selected point instead of going to the next SVG; with nothing selected it goes (asking first: the nudge is a change)", async () => {
    const onGo = vi.fn();
    const nav: EditNav = { canPrev: true, canNext: true, position: "1 / 2", onGo };
    await act(async () => { ui.render(<SvgPathEditor source={'<svg viewBox="0 0 24 24"><path d="M2 2L12 2"/></svg>'} box={{ width: 240, height: 240 }} testid="e" label="i" onFinish={vi.fn()} onCancel={vi.fn()} nav={nav} />); });
    const node = host.querySelector("[data-testid=e]") as HTMLElement;
    const ptr = (type: string, x: number, y: number) => node.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1 }));
    await act(async () => { ptr("pointerdown", 12, 2); ptr("pointerup", 12, 2); });
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(onGo).not.toHaveBeenCalled();
    expect((host.querySelector("[data-testid=e]") as HTMLElement).shadowRoot?.querySelector("[data-edit-path='0']")?.getAttribute("d")).toBe("M2 2L13 2");
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(host.querySelector("[data-testid=e-leave]")).not.toBeNull();
  });
});
