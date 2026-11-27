// pathedit_expand_divide.test.ts — two shape operations of edit mode
// (2026-11-27). Expand stroke: a selected line becomes a filled outline of its
// pen (its width, caps and joins), coloured like the line, with no stroke left;
// a shape that also had a fill keeps it and gets the outline as a new shape on
// top. Divide: selected fills that overlap are cut into separate pieces, one
// per area, each keeping the colour that was visible there. Both are one undo
// step and are written by Finish.
import { describe, expect, it } from "vitest";
import { ringsPaint, subToSegs } from "../src/lib/pathedit/curvecut";
import { IDENTITY, type PathModel } from "../src/lib/pathedit/model";
import { loadObjects, writeObjects } from "../src/lib/pathedit/objects";
import { expandStrokes } from "../src/lib/pathedit/outline";
import { divideObjects } from "../src/lib/pathedit/divide";
import { shapeLooks } from "../src/lib/pathedit/looks";
import { commit, newSession, undoSession, type EditSession } from "../src/lib/pathedit/session";
import { modalKeyAction } from "../src/svg/pathedit/hotkeys";

const I = Array.from({ length: 8 }, () => IDENTITY);
const open = (src: string): EditSession => newSession(loadObjects(src, I), []);
const tagsOf = (markup: string) => [...markup.matchAll(/<(path|rect|circle)\b[^>]*>/g)].map((m) => m[0]);
/** Does object `owner` paint the point (by its rings and fill rule)? */
function paints(m: PathModel, owner: number, x: number, y: number): boolean {
  const subs = m.subs.filter((s) => s.owner === owner);
  return ringsPaint(subs.map(subToSegs).filter((r) => r.length > 0), subs[0]?.fillRule ?? "nonzero", { x, y });
}
function expand(src: string, owners: number[]): EditSession {
  const s = open(src);
  const next = expandStrokes(s.model, owners, shapeLooks(src));
  return next === null ? s : commit(s, next);
}

const line = (extra: string) => `<svg viewBox="0 0 100 100"><path fill="none" stroke="#0A0" stroke-width="4" ${extra} d="M10 50L50 50"/></svg>`;

describe("Expand stroke", () => {
  it("a line becomes a filled outline as wide as its pen, coloured like the line, with no stroke", () => {
    const src = line("");
    const s = expand(src, [0]);
    expect(paints(s.model, 0, 30, 51.9)).toBe(true);
    expect(paints(s.model, 0, 30, 52.1)).toBe(false);
    expect(paints(s.model, 0, 9.5, 50)).toBe(false); // butt cap: nothing past the end
    const tag = tagsOf(writeObjects(src, s, I) as string)[0];
    expect(tag).toContain('fill="#00AA00"');
    expect(tag).toContain('stroke="none"');
    expect(tag).toMatch(/d="M[^"]*Z"/);
  });

  it("round and square caps reach past the ends", () => {
    const round = expand(line('stroke-linecap="round"'), [0]).model;
    expect(paints(round, 0, 8.5, 50)).toBe(true);
    expect(paints(round, 0, 8.5, 51.8)).toBe(false); // a round end, not a square one
    const square = expand(line('stroke-linecap="square"'), [0]).model;
    expect(paints(square, 0, 8.5, 51.8)).toBe(true);
  });

  it("a corner is joined: round by default settings of the file, miter fills the tip", () => {
    const corner = (join: string) => `<svg><path fill="none" stroke="#000" stroke-width="4" stroke-linejoin="${join}" d="M10 50L50 50L50 10"/></svg>`;
    expect(paints(expand(corner("miter"), [0]).model, 0, 51.8, 51.8)).toBe(true);
    expect(paints(expand(corner("round"), [0]).model, 0, 51.8, 51.8)).toBe(false);
    expect(paints(expand(corner("round"), [0]).model, 0, 51.2, 51.2)).toBe(true);
  });

  it("a closed line becomes a band: the middle stays empty", () => {
    const src = '<svg><path fill="none" stroke="#000" stroke-width="4" d="M20 20L80 20L80 80L20 80Z"/></svg>';
    const m = expand(src, [0]).model;
    expect(paints(m, 0, 21, 50)).toBe(true);
    expect(paints(m, 0, 50, 50)).toBe(false);
    expect(paints(m, 0, 17, 50)).toBe(false);
  });

  it("a curve keeps curves (no pile of straight pieces) and follows the pen", () => {
    const src = '<svg><path fill="none" stroke="#000" stroke-width="4" d="M10 50C10 20 50 20 50 50"/></svg>';
    const m = expand(src, [0]).model;
    expect(m.subs.filter((x) => x.owner === 0).flatMap((x) => x.anchors).some((a) => a.in !== null || a.out !== null)).toBe(true);
    expect(paints(m, 0, 30, 27.5)).toBe(true); // the top of the arc is at y = 27.5
    expect(paints(m, 0, 30, 24.5)).toBe(false);
    expect(paints(m, 0, 30, 31)).toBe(false);
  });

  it("a shape with a fill keeps it; the outline is a new shape above, the stroke goes", () => {
    const src = '<svg><path fill="#00F" stroke="#F00" stroke-width="4" d="M20 20L80 20L80 80L20 80Z"/></svg>';
    const s = expand(src, [0]);
    const tags = tagsOf(writeObjects(src, s, I) as string);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toContain('fill="#00F"');
    expect(tags[0]).toContain('stroke="none"');
    expect(tags[1]).toContain('fill="#FF0000"');
  });

  it("nothing to expand is no change; an expand is one undo step", () => {
    const filled = '<svg><path fill="#00F" d="M20 20L80 20L80 80L20 80Z"/></svg>';
    expect(expandStrokes(open(filled).model, [0], shapeLooks(filled))).toBeNull();
    const src = line("");
    expect(writeObjects(src, undoSession(expand(src, [0])), I)).toBeNull();
  });
});

const sq = (x: number, y: number, fill: string) => `<path fill="${fill}" d="M${x} ${y}L${x + 40} ${y}L${x + 40} ${y + 40}L${x} ${y + 40}Z"/>`;
/** A red square with a blue one over its lower right corner. */
const TWO = `<svg viewBox="0 0 100 100">${sq(10, 10, "#F00")}${sq(30, 30, "#00F")}</svg>`;

describe("Divide", () => {
  const divide = (src: string, owners: number[]): EditSession => {
    const s = open(src);
    const next = divideObjects(s.model, owners, shapeLooks(src), 2);
    return next === null ? s : commit(s, next);
  };

  it("two overlapping fills become three pieces, each with the colour that showed there", () => {
    const s = divide(TWO, [0, 1]);
    const tags = tagsOf(writeObjects(TWO, s, I) as string);
    expect(tags).toHaveLength(3);
    expect(tags.filter((t) => t.includes('fill="#F00"') || t.includes('fill="#FF0000"'))).toHaveLength(1);
    expect(tags.filter((t) => t.includes('fill="#00F"') || t.includes('fill="#0000FF"'))).toHaveLength(2);
  });

  it("the pieces do not overlap and together cover what was painted", () => {
    const m = divide(TWO, [0, 1]).model;
    const owners = [...new Set(m.subs.map((x) => x.owner as number))];
    const at = (x: number, y: number) => owners.filter((o) => paints(m, o, x, y)).length;
    expect(at(20, 20)).toBe(1); // red only
    expect(at(40, 40)).toBe(1); // the overlap: one piece, not two shapes
    expect(at(60, 60)).toBe(1); // blue only
    expect(at(5, 5)).toBe(0);
  });

  it("fills that do not overlap are left alone", () => {
    const apart = `<svg>${sq(0, 0, "#F00")}${sq(50, 50, "#00F")}</svg>`;
    expect(divideObjects(open(apart).model, [0, 1], shapeLooks(apart), 2)).toBeNull();
  });

  it("is one undo step", () => {
    expect(writeObjects(TWO, undoSession(divide(TWO, [0, 1])), I)).toBeNull();
  });
});

describe("the keys", () => {
  it("Ctrl+Shift+E expands strokes, Ctrl+Shift+D divides", () => {
    const key = (k: string) => modalKeyAction({ key: k, ctrlKey: true, metaKey: false, shiftKey: true, altKey: false });
    expect(key("E")).toBe("expand-stroke");
    expect(key("D")).toBe("divide");
  });
});
