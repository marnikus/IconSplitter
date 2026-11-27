// pathedit_layer_order.test.ts — layer order in edit mode (2026-11-27): Ctrl+]
// brings the selected shapes one step forward, Ctrl+[ sends them one step back
// (Ctrl+Shift+] / [ : to the front / to the back), as in Illustrator. A shape
// moves only among its siblings (the same group), so its transforms and
// inherited paint never change. The order is part of the session's model: Undo
// restores it, Finish writes the elements in the new order (with any geometry
// edits), and a click on an overlap picks the shape now on top.
import { describe, expect, it } from "vitest";
import { editorState, keyDown, type EditorState } from "../src/lib/pathedit/gesture";
import { IDENTITY } from "../src/lib/pathedit/model";
import { hasDirtyObjects, loadObjects, writeObjects } from "../src/lib/pathedit/objects";
import { arrangeSession, drawOrder } from "../src/lib/pathedit/layers";
import { paintedSubAt } from "../src/lib/pathedit/region";
import { newSession } from "../src/lib/pathedit/session";
import { modalKeyAction } from "../src/svg/pathedit/hotkeys";

const sq = (x: number, fill: string) => `<path fill="${fill}" d="M${x} 0L${x + 20} 0L${x + 20} 20L${x} 20Z"/>`;
/** Three overlapping squares: red (0) under green (1) under blue (2). */
const SRC = `<svg viewBox="0 0 100 100">${sq(0, "red")}${sq(5, "green")}<rect x="10" y="0" width="20" height="20" fill="blue"></rect></svg>`;
const I = [IDENTITY, IDENTITY, IDENTITY, IDENTITY];
const start = (objects: number[], src = SRC): EditorState => editorState(newSession(loadObjects(src, I), objects));
const fills = (markup: string) => [...markup.matchAll(/fill="(\w+)"/g)].map((m) => m[1]);

describe("arranging the selected shapes", () => {
  it("Ctrl+] brings one step forward; Ctrl+[ sends one step back", () => {
    const fwd = arrangeSession(SRC, start([0]).session, "forward");
    expect(drawOrder(fwd.model, 3)).toEqual([1, 0, 2]);
    const back = arrangeSession(SRC, start([2]).session, "backward");
    expect(drawOrder(back.model, 3)).toEqual([0, 2, 1]);
  });

  it("to the front / to the back, and no change at the edge", () => {
    expect(drawOrder(arrangeSession(SRC, start([0]).session, "front").model, 3)).toEqual([1, 2, 0]);
    expect(drawOrder(arrangeSession(SRC, start([2]).session, "back").model, 3)).toEqual([2, 0, 1]);
    const s = start([2]).session;
    expect(arrangeSession(SRC, s, "forward")).toBe(s);
  });

  it("several selected shapes keep their own order and move together", () => {
    const four = `<svg>${sq(0, "red")}${sq(5, "green")}${sq(10, "blue")}${sq(15, "black")}</svg>`;
    const s = editorState(newSession(loadObjects(four, I), [0, 1])).session;
    expect(drawOrder(arrangeSession(four, s, "forward").model, 4)).toEqual([2, 0, 1, 3]);
    expect(drawOrder(arrangeSession(four, s, "front").model, 4)).toEqual([2, 3, 0, 1]);
  });

  it("a shape moves only among its siblings — never out of its group", () => {
    const grouped = `<svg>${sq(0, "red")}<g transform="scale(2)">${sq(5, "green")}</g>${sq(10, "blue")}</svg>`;
    // red's next sibling SHAPE is blue: they swap places; the group stays where it is
    const red = editorState(newSession(loadObjects(grouped, I), [0])).session;
    expect(drawOrder(arrangeSession(grouped, red, "forward").model, 3)).toEqual([2, 1, 0]);
    // green is alone in its group: nothing to pass
    const green = editorState(newSession(loadObjects(grouped, I), [1])).session;
    expect(arrangeSession(grouped, green, "front")).toBe(green);
    const out = writeObjects(grouped, arrangeSession(grouped, red, "forward"), I) as string;
    expect(fills(out)).toEqual(["blue", "green", "red"]);
    expect(out).toContain('<g transform="scale(2)">');
  });
});

describe("the arranged order in the session and the file", () => {
  it("is undoable and makes the edit dirty", () => {
    const st = start([0]);
    const moved = { ...st, session: arrangeSession(SRC, st.session, "forward") };
    expect(hasDirtyObjects(moved.session)).toBe(true);
    const undone = keyDown(moved, { key: "z", ctrl: true, shift: false }).state;
    expect(drawOrder(undone.session.model, 3)).toEqual([0, 1, 2]);
    expect(hasDirtyObjects(undone.session)).toBe(false);
  });

  it("Finish writes the elements in the new order, each with its own attributes", () => {
    const st = start([2]);
    const out = writeObjects(SRC, arrangeSession(SRC, st.session, "back"), I);
    expect(out).not.toBeNull();
    expect(fills(out as string)).toEqual(["blue", "red", "green"]);
    expect(out).toContain('<rect x="10" y="0" width="20" height="20" fill="blue"></rect>');
  });

  it("a click on the overlap picks the shape now on top", () => {
    const st = start([0]);
    const front = arrangeSession(SRC, st.session, "front").model;
    const sub = paintedSubAt(front, { x: 15, y: 10 });
    expect(sub === null ? null : front.subs[sub].owner).toBe(0);
  });
});

describe("the keys", () => {
  const key = (k: string, code: string, shift = false) => modalKeyAction({ key: k, code, ctrlKey: true, metaKey: false, shiftKey: shift, altKey: false });
  it("Ctrl+] / Ctrl+[ and with Shift, also on keyboards where the bracket key types another letter", () => {
    expect(key("]", "BracketRight")).toBe("layer-forward");
    expect(key("[", "BracketLeft")).toBe("layer-backward");
    expect(key("}", "BracketRight", true)).toBe("layer-front");
    expect(key("{", "BracketLeft", true)).toBe("layer-back");
    expect(key("ú", "BracketLeft")).toBe("layer-backward");
    expect(key(")", "BracketRight")).toBe("layer-forward");
  });
});
