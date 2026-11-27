// pathedit_fill_bucket.test.ts — the Fill tool in edit mode (2026-11-27): a
// click fills the closed area under it with the current colour — an area closed
// by several lines, a piece of a fill cut off by a line, a hole in a fill, or a
// closed line. A whole shape is recoloured in place; any other area becomes a
// new filled shape placed just above what paints there (or at the bottom when
// nothing does), so lines stay on top. The fill is part of the session's model:
// Undo removes it, Finish writes it.
import { describe, expect, it } from "vitest";
import { IDENTITY } from "../src/lib/pathedit/model";
import { hasDirtyObjects, loadObjects, writeObjects } from "../src/lib/pathedit/objects";
import { fillAt } from "../src/lib/pathedit/bucket";
import { commit, newSession, undoSession, type EditSession } from "../src/lib/pathedit/session";
import { cssToHex, dropSwatch, parsePalette, saveSwatch, swapColors, withFg } from "../src/lib/pathedit/palette";
import { modalKeyAction } from "../src/svg/pathedit/hotkeys";
import { pathTagCount } from "../src/lib/pathedit/svgdoc";

const I = Array.from({ length: 8 }, () => IDENTITY);
const RED = "#FF0000";
const open = (src: string): EditSession => newSession(loadObjects(src, I), []);
/** One bucket click; the session after it (unchanged when nothing closed is there). */
function click(src: string, s: EditSession, x: number, y: number, color = RED): EditSession {
  const next = fillAt(s.model, { x, y }, color, pathTagCount(src));
  return next === null ? s : commit(s, next);
}
const save = (src: string, s: EditSession) => writeObjects(src, s, I) as string;
const tagsOf = (markup: string) => [...markup.matchAll(/<(path|rect|circle)\b[^>]*>/g)].map((m) => m[0]);

const LINE = 'fill="none" stroke="#000"';
const CLOSED_LINE = `<svg viewBox="0 0 100 100"><path ${LINE} d="M10 10L50 10L50 50L10 50Z"/></svg>`;
/** Three separate lines that cross and close a triangle between them. */
const THREE_LINES = `<svg viewBox="0 0 100 100" ${LINE}><path d="M0 10L100 10"/><path d="M10 0L60 100"/><path d="M90 0L40 100"/></svg>`;
const DONUT = '<svg viewBox="0 0 100 100"><path fill="#000" fill-rule="evenodd" d="M10 10L90 10L90 90L10 90ZM40 40L60 40L60 60L40 60Z"/></svg>';
const SQUARE = '<svg viewBox="0 0 100 100"><path fill="#00F" d="M10 10L90 10L90 90L10 90Z"/></svg>';
/** A blue square with a line across it. */
const CUT_SQUARE = `<svg viewBox="0 0 100 100"><path fill="#00F" d="M10 10L90 10L90 90L10 90Z"/><path ${LINE} d="M0 50L100 50"/></svg>`;

describe("the Fill tool", () => {
  it("a closed line gets the colour itself — no extra shape", () => {
    const out = save(CLOSED_LINE, click(CLOSED_LINE, open(CLOSED_LINE), 30, 30));
    expect(tagsOf(out)).toHaveLength(1);
    expect(tagsOf(out)[0]).toContain(`fill="${RED}"`);
    expect(tagsOf(out)[0]).toContain('stroke="#000"');
  });

  it("an area closed by several lines becomes a new filled shape under the lines", () => {
    const s = click(THREE_LINES, open(THREE_LINES), 50, 20);
    const tags = tagsOf(save(THREE_LINES, s));
    expect(tags).toHaveLength(4);
    expect(tags[0]).toContain(`fill="${RED}"`);
    expect(tags[0]).toContain('stroke="none"');
    expect(tags.slice(1).every((t) => !t.includes(RED))).toBe(true);
  });

  it("a hole in a fill is filled by a new shape of the hole's size", () => {
    const s = click(DONUT, open(DONUT), 50, 50);
    const tags = tagsOf(save(DONUT, s));
    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain(`fill="${RED}"`);
    expect(tags[0]).toMatch(/M40 40|M60 40|M60 60|M40 60/);
    expect(tags[1]).toContain('fill="#000"');
  });

  it("a whole filled shape is recoloured in place", () => {
    const out = save(SQUARE, click(SQUARE, open(SQUARE), 50, 50));
    expect(tagsOf(out)).toEqual([`<path fill="${RED}" d="M10 10L90 10L90 90L10 90Z"/>`]);
  });

  it("the body of a shape with a hole is recoloured, hole kept", () => {
    const out = save(DONUT, click(DONUT, open(DONUT), 20, 20));
    expect(tagsOf(out)).toHaveLength(1);
    expect(tagsOf(out)[0]).toContain(`fill="${RED}"`);
  });

  it("a piece of a fill cut off by a line is filled alone, above the fill and under the line", () => {
    const s = click(CUT_SQUARE, open(CUT_SQUARE), 50, 30);
    const tags = tagsOf(save(CUT_SQUARE, s));
    expect(tags).toHaveLength(3);
    expect(tags[0]).toContain('fill="#00F"');
    expect(tags[1]).toContain(`fill="${RED}"`);
    expect(tags[2]).toContain('stroke="#000"');
  });

  it("a second click on a filled area changes its colour instead of stacking another shape", () => {
    let s = click(THREE_LINES, open(THREE_LINES), 50, 20);
    s = click(THREE_LINES, s, 50, 20, "#00FF00");
    const tags = tagsOf(save(THREE_LINES, s));
    expect(tags).toHaveLength(4);
    expect(tags[0]).toContain('fill="#00FF00"');
  });

  it("empty space and open lines fill nothing", () => {
    const s = open(THREE_LINES);
    expect(fillAt(s.model, { x: 5, y: 90 }, RED, 3)).toBeNull();
  });

  it("is one undo step and makes the edit dirty", () => {
    const s = click(SQUARE, open(SQUARE), 50, 50);
    expect(hasDirtyObjects(s)).toBe(true);
    const back = undoSession(s);
    expect(hasDirtyObjects(back)).toBe(false);
    expect(writeObjects(SQUARE, back, I)).toBeNull();
  });

  it("a later point edit keeps the fill", () => {
    const s = click(THREE_LINES, open(THREE_LINES), 50, 20);
    const moved = commit(s, { subs: s.model.subs.map((x, k) => (k === 0 ? { ...x, anchors: x.anchors.map((a) => ({ ...a, y: a.y + 1 })) } : x)) });
    expect(tagsOf(save(THREE_LINES, moved)).some((t) => t.includes(RED))).toBe(true);
  });
});

describe("the colour palette", () => {
  const P = { fg: "#111111", bg: "#EEEEEE", swatches: ["#AA0000"] };
  it("swaps the two colours, sets the current one, saves and drops swatches", () => {
    expect(swapColors(P)).toMatchObject({ fg: "#EEEEEE", bg: "#111111" });
    expect(withFg(P, "#00aa00").fg).toBe("#00AA00");
    expect(withFg(P, "nonsense")).toBe(P);
    expect(saveSwatch(P, "#00BB00").swatches).toEqual(["#AA0000", "#00BB00"]);
    expect(saveSwatch(P, "#aa0000").swatches).toEqual(["#AA0000"]);
    expect(dropSwatch(P, "#AA0000").swatches).toEqual([]);
  });

  it("reads a stored palette safely and a browser colour as hex", () => {
    expect(parsePalette({ fg: "#123456", bg: 5, swatches: ["#abcdef", "<x>", 7] })).toEqual({ fg: "#123456", bg: "#FFFFFF", swatches: ["#ABCDEF"] });
    expect(parsePalette(null)).toEqual({ fg: "#000000", bg: "#FFFFFF", swatches: [] });
    expect(cssToHex("rgb(255, 0, 16)")).toBe("#FF0010");
    expect(cssToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(cssToHex("none")).toBeNull();
    expect(cssToHex("#abc")).toBe("#AABBCC");
  });

  it("K picks the Fill tool and X swaps the colours", () => {
    const key = (k: string) => modalKeyAction({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
    expect(key("k")).toBe("tool-fill");
    expect(key("x")).toBe("swap-colors");
  });
});
