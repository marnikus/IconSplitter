// pathedit_modal.test.tsx — the full-screen edit mode (2026-11-06): one modal
// for the whole tab with every control outside the artboard (top bar, hotkey
// legend at the bottom), ← / → to the previous / next SVG row (asking to save
// or discard unsaved changes), Ctrl+Shift+S save & next, Ctrl+Shift+X discard
// & next, I = thin / preset stroke view, V / P = tools, Ctrl+Z / Ctrl+Shift+Z
// undo / redo on a session-only history of at most 50 steps, Cancel closes.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editorState, keyDown } from "../src/lib/pathedit/gesture";
import { fromPathData } from "../src/lib/pathedit/model";
import { commit, newSession, MAX_SESSION_HISTORY } from "../src/lib/pathedit/session";
import { EDIT_HOTKEYS, modalKeyAction } from "../src/svg/pathedit/hotkeys";
import { neighborRow } from "../src/svg/pathedit/editnav";
import { closeSvgEditor, getSvgEditorId, openSvgEditor } from "../src/svg/pathedit/editmodalstore";
import SvgPathEditor, { type EditNav } from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const key = (k: string, mods: Partial<KeyboardEventInit> = {}) => new KeyboardEvent("keydown", { key: k, bubbles: true, ...mods });

describe("session history", () => {
  it("keeps at most 50 undo steps and redoes with Ctrl+Shift+Z", () => {
    expect(MAX_SESSION_HISTORY).toBe(50);
    let s = newSession(fromPathData("M0 0L10 0"));
    for (let i = 1; i <= 60; i++) s = commit(s, fromPathData(`M0 0L${10 + i} 0`));
    expect(s.undo).toHaveLength(50);
    let st = editorState(s);
    st = keyDown(st, { key: "z", ctrl: true, shift: false }).state;
    st = keyDown(st, { key: "Z", ctrl: true, shift: true }).state;
    expect(st.session.model.subs[0].anchors[1].x).toBe(70);
  });
});

describe("the edit mode's keys", () => {
  it("maps arrows, save/discard & next, I, V and P", () => {
    expect(modalKeyAction(key("ArrowRight"))).toBe("next");
    expect(modalKeyAction(key("ArrowLeft"))).toBe("prev");
    expect(modalKeyAction(key("S", { ctrlKey: true, shiftKey: true }))).toBe("save-next");
    expect(modalKeyAction(key("X", { ctrlKey: true, shiftKey: true }))).toBe("discard-next");
    expect(modalKeyAction(key("i"))).toBe("toggle-stroke");
    expect(modalKeyAction(key("v"))).toBe("tool-select");
    expect(modalKeyAction(key("p"))).toBe("tool-draw");
    expect(modalKeyAction(key("z", { ctrlKey: true }))).toBeNull(); // the session's own
  });

  it("the legend names every key, including Ctrl+Z and Ctrl+Shift+Z", () => {
    const keys = EDIT_HOTKEYS.map((h) => h.keys);
    for (const k of ["Ctrl+Z", "Ctrl+Shift+Z", "←  →", "Ctrl+Shift+S", "Ctrl+Shift+X", "I", "Delete", "Esc", "Enter"]) expect(keys).toContain(k);
  });
});

describe("moving between rows", () => {
  const row = (id: string, svg = true, running = false) => ({ source: { id }, svg, running, queued: false });
  const editable = (r: ReturnType<typeof row>) => r.svg && !r.running;
  it("finds the previous / next editable row in the list's order, never past the ends", () => {
    const rows = [row("a"), row("b", false), row("c"), row("d", true, true)];
    expect(neighborRow(rows, "a", 1, editable)?.source.id).toBe("c");
    expect(neighborRow(rows, "c", -1, editable)?.source.id).toBe("a");
    expect(neighborRow(rows, "c", 1, editable)).toBeNull();
  });
  it("one store says which row is open; Cancel closes it", () => {
    openSvgEditor("a");
    expect(getSvgEditorId()).toBe("a");
    closeSvgEditor();
    expect(getSvgEditorId()).toBeNull();
  });
});

describe("the edit surface", () => {
  const SRC = '<svg viewBox="0 0 24 24"><path d="M2 2L12 2L12 12"/></svg>';
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
  const q = (sel: string) => host.querySelector(sel);
  const pointer = (t: EventTarget, type: string, x: number, y: number) =>
    t.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * SCALE, clientY: y * SCALE, pointerId: 1 }));

  async function mount(nav: Partial<EditNav> = {}) {
    const onGo = vi.fn();
    const full: EditNav = { canPrev: true, canNext: true, position: "2 / 3 · icon", onGo, ...nav };
    await act(async () => { ui.render(<SvgPathEditor source={SRC} box={{ width: 240, height: 240 }} testid="e" label="icon" onFinish={vi.fn()} onCancel={vi.fn()} nav={full} />); });
    return onGo;
  }
  const edit = async () => {
    const node = q("[data-testid=e]") as HTMLElement;
    await act(async () => { pointer(node, "pointerdown", 12, 2); pointer(node, "pointermove", 14, 4); pointer(node, "pointerup", 14, 4); });
  };

  it("has its controls outside the artboard: top bar, side arrows, the hotkey legend", async () => {
    await mount();
    expect(q("[data-testid=e-toolbar]")).not.toBeNull();
    expect(q("[data-testid=e-prev]")).not.toBeNull();
    expect(q("[data-testid=e-next]")).not.toBeNull();
    expect(q("[data-testid=e-legend]")?.textContent).toContain("Ctrl+Shift+Z");
    expect(q("[data-testid=e-position]")?.textContent).toBe("2 / 3 · icon");
  });

  it("→ with nothing changed moves on at once; with changes it asks, and Discard moves on", async () => {
    const onGo = await mount();
    await act(async () => { window.dispatchEvent(key("ArrowRight")); });
    expect(onGo).toHaveBeenLastCalledWith(1, null);
    await edit();
    await act(async () => { window.dispatchEvent(key("ArrowRight")); });
    expect(q("[data-testid=e-leave]")).not.toBeNull();
    await act(async () => { (q("[data-testid=e-leave-discard]") as HTMLButtonElement).click(); });
    expect(onGo).toHaveBeenLastCalledWith(1, null);
  });

  it("Save in the question, and Ctrl+Shift+S, hand over the rewritten file; Ctrl+Shift+X discards", async () => {
    const onGo = await mount();
    await edit();
    await act(async () => { (q("[data-testid=e-next]") as HTMLButtonElement).click(); });
    await act(async () => { (q("[data-testid=e-leave-save]") as HTMLButtonElement).click(); });
    expect(onGo.mock.calls.at(-1)?.[1]).toContain('d="M2 2L14 4L12 12"');
    await act(async () => { window.dispatchEvent(key("S", { ctrlKey: true, shiftKey: true })); });
    expect(onGo.mock.calls.at(-1)?.[1]).toContain('d="M2 2L14 4L12 12"');
    await act(async () => { window.dispatchEvent(key("X", { ctrlKey: true, shiftKey: true })); });
    expect(onGo).toHaveBeenLastCalledWith(1, null);
  });

  it("I switches thin / preset stroke; V and P pick the tools; other app keys never fire", async () => {
    await mount();
    const appKeys = vi.fn();
    window.addEventListener("keydown", appKeys);
    expect((q("[data-testid=e]") as HTMLElement).dataset.stroke).toBe("preset");
    await act(async () => { window.dispatchEvent(key("i")); });
    expect((q("[data-testid=e]") as HTMLElement).dataset.stroke).toBe("thin");
    await act(async () => { window.dispatchEvent(key("p")); });
    expect(q("[data-testid=e-tool-draw]")?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { window.dispatchEvent(key("a")); window.dispatchEvent(key("s", { ctrlKey: true })); });
    window.removeEventListener("keydown", appKeys);
    expect(appKeys).not.toHaveBeenCalled();
  });
});

describe("wired as one modal for the tab", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("the panel mounts the modal; a row's Edit opens it", () => {
    expect(src("src/svg/SvgPanel.tsx")).toContain("<SvgEditModal");
    expect(src("src/svg/svgeditslot.tsx")).toContain("openSvgEditor(");
  });
});

