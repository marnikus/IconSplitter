// preview_pan.test.tsx — hold the middle mouse button and drag to move a
// (zoomed) SVG preview inside its frame (2026-11-06): row previews (Generate
// SVG, SVG to upload) and the edit mode's artboard. The 100 % button resets
// zoom AND position; the browser's middle-click auto-scroll is suppressed.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_ZOOM, panBy } from "../src/lib/zoomview";
import SvgPreviewBox from "../src/svg/SvgPreview";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
afterEach(() => { act(() => ui.unmount()); host.remove(); });
const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const ptr = (el: Element, type: string, x: number, y: number, button = 1) => {
  const e = new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, button, buttons: button === 1 ? 4 : 1, clientX: x, clientY: y, pointerId: 7 });
  return el.dispatchEvent(e);
};
const midDrag = async (el: Element, dx: number, dy: number) => {
  await act(async () => { ptr(el, "pointerdown", 10, 10); ptr(el, "pointermove", 10 + dx, 10 + dy); ptr(el, "pointerup", 10 + dx, 10 + dy); });
};

describe("panBy", () => {
  it("moves the view, keeping its scale", () => {
    expect(panBy({ scale: 2, x: 5, y: 5 }, 10, -3)).toEqual({ scale: 2, x: 15, y: 2 });
    expect(panBy(NO_ZOOM, 0, 0)).toEqual(NO_ZOOM);
  });
});

describe("a row preview", () => {
  it("a middle-button drag moves the artwork; 100 % puts it back; a left drag does not move it", async () => {
    await act(async () => { ui.render(<SvgPreviewBox code={'<svg viewBox="0 0 24 24"><path d="M2 2L20 20"/></svg>'} box={{ width: 100, height: 100 }} testid="p" label="icon" version={1} />); });
    const art = q("[data-testid=p]") as HTMLElement;
    let prevented = false;
    await act(async () => { prevented = !ptr(art, "pointerdown", 10, 10); ptr(art, "pointerup", 10, 10); });
    expect(prevented).toBe(true); // no auto-scroll
    await midDrag(art, 30, -12);
    expect(art.style.transform).toBe("translate(30px, -12px) scale(1)");
    await act(async () => { ptr(art, "pointerdown", 10, 10, 0); ptr(art, "pointermove", 50, 50, 0); ptr(art, "pointerup", 50, 50, 0); });
    expect(art.style.transform).toBe("translate(30px, -12px) scale(1)");
    await act(async () => { (q("[data-testid=p-zoom]") as HTMLButtonElement).click(); });
    expect(art.style.transform).toBe("translate(0px, 0px) scale(1)");
  });
});

describe("the edit mode's artboard", () => {
  it("a middle-button drag moves the icon and edits nothing", async () => {
    const onFinish = vi.fn();
    await act(async () => {
      ui.render(<SvgPathEditor source={'<svg viewBox="0 0 24 24"><path d="M2 2L12 2"/></svg>'} box={{ width: 200, height: 200 }}
        testid="e" label="icon" onFinish={onFinish} onCancel={vi.fn()} />);
    });
    const art = q("[data-testid=e]") as HTMLElement;
    await midDrag(art, -20, 15);
    expect(art.style.transform).toBe("translate(-20px, 15px) scale(1)");
    expect((q("[data-testid=e-finish]") as HTMLButtonElement).disabled).toBe(true);
    expect(q("[data-testid=e-legend]")?.textContent).toContain("Middle-drag");
  });
});
