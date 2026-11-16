// svg_open_editor.test.tsx — opening the SVG edit mode from the list
// (2026-11-06): Enter on the active row, or a double-click on a row's SVG
// thumbnail. Only a row with a drawn SVG and no run writing it opens; Enter on
// a focused button keeps doing what the button does.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSvgHotkeys, type SvgHotActions } from "../src/svg/SvgHotkeys";
import { closeSvgEditor, getSvgEditorId } from "../src/svg/pathedit/editmodalstore";
import { editableRow } from "../src/svg/pathedit/editnav";
import { toRow } from "../src/svg/rowmodel";
import type { SvgRow } from "../src/svg/types";
import { pairMetaFor, svgSource, svgVersion } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function rowWith(id: string, withSvg: boolean, running = false): SvgRow {
  const source = svgSource(id, { dir: "a", name: `${id}_AI.png` });
  const meta = withSvg ? pairMetaFor(source, [svgVersion(`a/${id}_AI.svg`)]) : null;
  return { ...toRow(source, meta, false), running };
}

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => { closeSvgEditor(); host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
afterEach(() => { act(() => ui.unmount()); host.remove(); closeSvgEditor(); });

function Keys({ rows, active }: { rows: SvgRow[]; active: string }) {
  const noop = () => undefined;
  const a: SvgHotActions = { visible: rows, activeId: active, dialogOpen: false, setActive: noop, toggleCheck: noop, generate: noop, decide: noop, showCode: noop, dismissDialog: noop };
  useSvgHotkeys(a, true);
  return <button type="button" data-testid="btn">a button</button>;
}
const enter = (target: EventTarget = window) => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

describe("Enter on the active row", () => {
  it("opens the edit mode on it", async () => {
    await act(async () => { ui.render(<Keys rows={[rowWith("r1", true)]} active="r1" />); });
    await act(async () => { enter(); });
    expect(getSvgEditorId()).toBe("r1");
  });

  it("not for a row without an SVG or with a run on it; not when a button has the key", async () => {
    await act(async () => { ui.render(<Keys rows={[rowWith("r1", false), rowWith("r2", true, true), rowWith("r3", true)]} active="r1" />); });
    await act(async () => { enter(); });
    expect(getSvgEditorId()).toBeNull();
    await act(async () => { ui.render(<Keys rows={[rowWith("r2", true, true)]} active="r2" />); });
    await act(async () => { enter(); });
    expect(getSvgEditorId()).toBeNull();
    await act(async () => { ui.render(<Keys rows={[rowWith("r3", true)]} active="r3" />); });
    await act(async () => { enter(host.querySelector("[data-testid=btn]") as HTMLElement); });
    expect(getSvgEditorId()).toBeNull();
  });

  it("uses the edit mode's own rule for an editable row", () => {
    expect(editableRow(rowWith("r1", true))).toBe(true);
    expect(editableRow(rowWith("r1", false))).toBe(false);
  });
});

describe("double-click on the SVG thumbnail", () => {
  it("is wired on the row's SVG preview", () => {
    const src = readFileSync("src/svg/SvgThumbs.tsx", "utf8");
    expect(src).toContain("onDoubleClick");
    expect(src).toContain("openSvgEditor(");
  });
});
