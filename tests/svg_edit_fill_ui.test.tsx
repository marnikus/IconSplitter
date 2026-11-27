// svg_edit_fill_ui.test.tsx — the Fill tool on the edit artboard and the colour
// bar in the top panel (2026-11-27): the drawn icon shows the session's fills
// (and loses them on undo), added shapes sit where Finish writes them, and the
// bar swaps the two colours, offers close colours, and saves / removes swatches
// that survive a reload.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fillAt } from "../src/lib/pathedit/bucket";
import { IDENTITY, type PathModel } from "../src/lib/pathedit/model";
import { loadObjects, objectData } from "../src/lib/pathedit/objects";
import { annotatePaths } from "../src/lib/pathedit/svgdoc";
import { smartSwatches } from "../src/lib/svgBuilder/swatches";
import EditColorBar from "../src/svg/pathedit/EditColorBar";
import { EDIT_COLORS_KEY, getPalette, resetPaletteCache } from "../src/svg/pathedit/editcolors";
import { livePaint } from "../src/svg/pathedit/livepaint";
import { colorUnder } from "../src/svg/pathedit/useEditFill";

const I = [IDENTITY, IDENTITY, IDENTITY];
const SRC = '<svg viewBox="0 0 100 100"><path fill="#00F" d="M10 10L90 10L90 90L10 90Z"/><path fill="none" stroke="#000" d="M0 50L100 50"/></svg>';

function board(): { root: ShadowRoot; model: PathModel } {
  const host = document.createElement("div");
  document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = annotatePaths(SRC);
  return { root, model: loadObjects(SRC, I) };
}
const paint = (root: ShadowRoot, m: PathModel) => livePaint(root, m, (o) => objectData(m, o, IDENTITY), true);
const shapes = (root: ShadowRoot) => Array.from(root.querySelectorAll("svg > *")).map((el) => el.getAttribute("data-edit-path"));

beforeEach(() => { localStorage.clear(); resetPaletteCache(); });

describe("the artboard shows the fills", () => {
  it("a piece filled by the tool is drawn between the fill it sits on and the line above", () => {
    const { root, model } = board();
    const filled = fillAt(model, { x: 50, y: 30 }, "#FF0000", 2) as PathModel;
    paint(root, filled);
    expect(shapes(root)).toEqual(["0", "2", "1"]);
    const added = root.querySelector('[data-edit-path="2"]') as Element;
    expect(added.getAttribute("fill")).toBe("#FF0000");
    expect(added.getAttribute("stroke")).toBe("none");
    paint(root, model); // undo
    expect(shapes(root)).toEqual(["0", "1"]);
  });

  it("a recoloured shape shows the colour, and its own again after undo", () => {
    const { root, model } = board();
    const el = root.querySelector('[data-edit-path="0"]') as SVGElement;
    paint(root, { ...model, paint: { 0: "#00FF00" } });
    expect(el.style.getPropertyValue("fill")).toMatch(/#00ff00|rgb\(0, 255, 0\)/i);
    paint(root, model);
    expect(el.style.getPropertyValue("fill")).toBe("");
  });

  it("an expanded line shows no stroke and its fill rule, and its own look again after undo", () => {
    const { root, model } = board();
    const el = root.querySelector('[data-edit-path="1"]') as SVGElement;
    paint(root, { ...model, nostroke: [1], rules: { 1: "nonzero" }, paint: { 1: "#000000" } });
    expect(el.style.getPropertyValue("stroke")).toBe("none");
    expect(el.style.getPropertyValue("fill-rule")).toBe("nonzero");
    paint(root, model);
    expect(el.style.getPropertyValue("stroke")).toBe("");
    expect(el.style.getPropertyValue("fill-rule")).toBe("");
  });

  it("the picker reads the session's colour of the shape under the pointer", () => {
    const { root, model } = board();
    const el = root.querySelector('[data-edit-path="0"]') as Element;
    const e = { composedPath: () => [el] } as unknown as Event;
    expect(colorUnder(e, { ...model, paint: { 0: "#123456" } })).toBe("#123456");
  });
});

describe("the colour bar", () => {
  let box: HTMLDivElement;
  let ui: Root;
  const show = (selected: number, onFill: () => void = () => undefined) =>
    act(() => { ui.render(<EditColorBar testid="ed" selected={selected} onFillSelected={onFill} />); });
  const el = (id: string) => box.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  const click = (id: string) => act(() => { el(id).click(); });
  beforeEach(() => { box = document.createElement("div"); document.body.append(box); ui = createRoot(box); });
  afterEach(() => { act(() => ui.unmount()); box.remove(); });

  it("swaps the two colours and offers the colours close to the current one", () => {
    show(0);
    expect(getPalette()).toMatchObject({ fg: "#000000", bg: "#FFFFFF" });
    click("ed-color-swap");
    expect(getPalette()).toMatchObject({ fg: "#FFFFFF", bg: "#000000" });
    const near = smartSwatches("#FFFFFF")[0];
    click(`ed-color-swatch-${near.slice(1)}`);
    expect(getPalette().fg).toBe(near);
  });

  it("saves the current colour as a swatch that survives a reload, and removes it on right-click", () => {
    show(0);
    const near = smartSwatches("#000000")[0];
    click(`ed-color-swatch-${near.slice(1)}`);
    click("ed-color-save");
    expect(JSON.parse(localStorage.getItem(EDIT_COLORS_KEY) as string).swatches).toEqual([near]);
    resetPaletteCache();
    expect(getPalette().swatches).toEqual([near]);
    act(() => { el(`ed-color-saved-${near.slice(1)}`).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })); });
    expect(getPalette().swatches).toEqual([]);
  });

  it("fill selected is offered only with a shape selected", () => {
    let hits = 0;
    show(0, () => { hits += 1; });
    expect((el("ed-color-fill-selected") as HTMLButtonElement).disabled).toBe(true);
    show(1, () => { hits += 1; });
    click("ed-color-fill-selected");
    expect(hits).toBe(1);
  });
});
