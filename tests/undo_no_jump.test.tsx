// undo_no_jump.test.tsx — Ctrl+Z undoes without moving the page (2026-11-06
// report: after a tail cut, Ctrl+Z jumped to other rows; the Undo button did
// not). Three causes, three rules:
// 1. a held Ctrl+Z auto-repeats — the repeats are ignored (one press = one step,
//    like the button), otherwise earlier "move active row" steps were undone too;
// 2. an undo / redo never scrolls the list to the active row it puts back;
// 3. an SVG rewritten by an undo keeps showing until its new text is read (no
//    blank frame that resizes the row).
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { historyKeyOf } from "../src/state/HistoryProvider";
import { holdRowScroll, useCheckedRows } from "../src/ui/checkedrows";
import { bumpSvgFile, useSvgText } from "../src/svg/usesvgtext";
import { FakeDir, FakeFile } from "./helpers/fakefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("1. one press = one step", () => {
  it("Ctrl+Z undoes, Ctrl+Shift+Z / Ctrl+Y redo, an auto-repeat does nothing", () => {
    expect(historyKeyOf(key({ key: "z", ctrlKey: true }))).toBe("undo");
    expect(historyKeyOf(key({ key: "Z", ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(historyKeyOf(key({ key: "y", ctrlKey: true }))).toBe("redo");
    expect(historyKeyOf(key({ key: "z", ctrlKey: true, repeat: true }))).toBe("ignore");
    expect(historyKeyOf(key({ key: "z" }))).toBeNull();
  });
});

let host: HTMLDivElement;
let ui: Root;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); ui = createRoot(host); });
afterEach(() => { act(() => ui.unmount()); host.remove(); vi.restoreAllMocks(); });

describe("2. an undo never scrolls to the active row", () => {
  function List({ active }: { active: string }) {
    const register = useCheckedRows([], active, true);
    return <>{["a", "b"].map((id) => <div key={id} ref={(n) => register(id, n)} data-id={id}><input type="checkbox" /></div>)}</>;
  }

  it("a normal move of the active row scrolls to it; one applied by undo does not", async () => {
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    await act(async () => { ui.render(<List active="a" />); });
    await act(async () => { ui.render(<List active="b" />); });
    expect(scroll).toHaveBeenCalled();
    scroll.mockClear();
    holdRowScroll(); // what the history does around an undo / redo
    await act(async () => { ui.render(<List active="a" />); });
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe("3. a rewritten SVG keeps showing while it is read again", () => {
  it("no blank frame after the file is rewritten", async () => {
    const root = new FakeDir("root");
    root.children.set("a.svg", new FakeFile("a.svg", 5, 1, "<svg>old</svg>"));
    const seen: (string | null)[] = [];
    const rootRef = { current: root as never }; // one stable ref, as the panel passes it
    function Probe() {
      const text = useSvgText(rootRef, 1, "a.svg");
      useEffect(() => { seen.push(text); });
      return null;
    }
    await act(async () => { ui.render(<Probe />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(seen.at(-1)).toBe("<svg>old</svg>");
    seen.length = 0;
    (root.children.get("a.svg") as unknown as { text: string }).text = "<svg>new</svg>";
    await act(async () => { bumpSvgFile("a.svg"); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(seen).not.toContain(null);
    expect(seen.at(-1)).toBe("<svg>new</svg>");
  });
});
