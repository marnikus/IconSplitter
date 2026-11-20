// pathedit_inverted_mask_perf.test.tsx — round-8 regression & performance tests
// (2026-11-20, ref image-12): when a filled shape ALREADY carries an inverted
// mask subpath coincident with a stroked badge/ribbon outline (so the forked
// ribbon tail hanging below the fill's edge is painted), editing and deleting
// that tail with Alt+Shift boolean cut must:
//   1. never shatter coincident curves into 24x micro-anchors/slivers,
//   2. complete hover previews, boolean tail deletion, and follow-up edits in
//      a few milliseconds (never freezing the UI), and
//   3. remove ONLY the protruding ribbon tail while keeping the badge interior
//      white, the surrounding fill painted, and the stroked badge untouched.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { editorState, hoverAt, pointerDown, pointerMove, pointerUp, type EditorState, type PointerInput } from "../src/lib/pathedit/gesture";
import { fromPathData, toPathData, type PathModel, type Pt } from "../src/lib/pathedit/model";
import { loadObjects } from "../src/lib/pathedit/objects";
import { paintedSubAt } from "../src/lib/pathedit/region";
import { newSession, undoSession } from "../src/lib/pathedit/session";
import SvgPathEditor from "../src/svg/pathedit/SvgPathEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const both = { alt: true, shift: true };

const at = (x: number, y: number, mods: Partial<PointerInput> = {}): PointerInput =>
  ({ p: { x, y }, ctrl: false, alt: false, shift: false, unitsPerPx: 1, target: null, ...mods });

const click = (st: EditorState, input: PointerInput): EditorState => pointerUp(pointerDown(st, input));

const painted = (m: PathModel, p: Pt, owner?: number): boolean =>
  paintedSubAt(m, p, owner === undefined ? () => true : (o) => o === owner) !== null;

/** Scalloped N-lobe rosette + curved forked ribbon tail (ref image-12). */
function rosetteRibbonPath(lobes: number, reverse = false): string {
  const cx = 150, cy = 115, r0 = 76;
  const s0 = (108 * Math.PI) / 180, s1 = (432 * Math.PI) / 180;
  type Seg = [Pt, Pt, Pt, Pt];
  const segs: Seg[] = [];
  let prev: Pt = { x: +(cx + r0 * Math.cos(s0)).toFixed(3), y: +(cy + r0 * Math.sin(s0)).toFixed(3) };
  for (let k = 0; k < lobes; k++) {
    const t0 = s0 + ((s1 - s0) * k) / lobes, t1 = s0 + ((s1 - s0) * (k + 1)) / lobes;
    const bulge = k % 2 === 0 ? r0 + 14 : r0 - 6;
    const next: Pt = { x: +(cx + r0 * Math.cos(t1)).toFixed(3), y: +(cy + r0 * Math.sin(t1)).toFixed(3) };
    const c1: Pt = { x: +(cx + bulge * Math.cos(t0 + (t1 - t0) * 0.35)).toFixed(3), y: +(cy + bulge * Math.sin(t0 + (t1 - t0) * 0.35)).toFixed(3) };
    const c2: Pt = { x: +(cx + bulge * Math.cos(t0 + (t1 - t0) * 0.65)).toFixed(3), y: +(cy + bulge * Math.sin(t0 + (t1 - t0) * 0.65)).toFixed(3) };
    segs.push([prev, c1, c2, next]);
    prev = next;
  }
  const startPt = segs[0][0];
  const rTip = { x: 198, y: 285 }, vMid = { x: 150, y: 248 }, lTip = { x: 102, y: 285 };
  segs.push([prev, { x: 182, y: 220 }, { x: 190, y: 252 }, rTip]);
  segs.push([rTip, { x: 180, y: 274 }, { x: 165, y: 260 }, vMid]);
  segs.push([vMid, { x: 135, y: 260 }, { x: 120, y: 274 }, lTip]);
  segs.push([lTip, { x: 110, y: 252 }, { x: 118, y: 220 }, startPt]);
  const raw = `M${segs[0][0].x} ${segs[0][0].y}${segs.map(([, b, c, d]) => `C${b.x} ${b.y} ${c.x} ${c.y} ${d.x} ${d.y}`).join("")}Z`;
  if (!reverse) return raw;
  const sub = fromPathData(raw).subs[0];
  const rev = sub.anchors.slice().reverse().map((a) => ({
    x: a.x, y: a.y, in: a.out && { ...a.out }, out: a.in && { ...a.in }, mode: a.mode,
  }));
  return toPathData({ subs: [{ anchors: rev, closed: true }] });
}

function buildImage12Svg(rule: "nonzero" | "evenodd", lobes = 24, extraPaths = 0): string {
  const card = "M0 0L300 0L300 150C268 165 256 196 236 205L168 218L0 192Z";
  const maskInFill = rosetteRibbonPath(lobes, rule === "nonzero");
  const strokeBadge = rosetteRibbonPath(lobes, false);
  const innerCircle = "M150 70C175 70 195 90 195 115C195 140 175 160 150 160C125 160 105 140 105 115C105 90 125 70 150 70Z";
  const ruleAttr = rule === "evenodd" ? ' fill-rule="evenodd"' : "";
  let decor = "";
  for (let p = 0; p < extraPaths; p++) {
    let d = `M10 ${10 + p * 8}`;
    for (let k = 1; k <= 25; k++) {
      const x = 10 + k * 11, y = 10 + p * 8 + (k % 2) * 4;
      d += `C${x - 6} ${y + 3} ${x - 3} ${y - 3} ${x} ${y}`;
    }
    decor += `<path data-edit-path="${p + 2}" fill="none" stroke="#000" d="${d}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 310">`
    + `<path data-edit-path="0" fill="#1da1f2"${ruleAttr} d="${card} ${maskInFill}"/>`
    + `<path data-edit-path="1" fill="none" stroke="#000" stroke-width="5" d="${strokeBadge} ${innerCircle} M2 230L46 228"/>`
    + decor
    + `</svg>`;
}

describe("inverted mask ribbon-tail boolean deletion & edit-mode non-freeze (ref image-12)", () => {
  it.each(["nonzero", "evenodd"] as const)(
    "deletes ONLY the protruding inverted ribbon tail (%s) without curve splintering, and allows further edits",
    (rule) => {
      const svg = buildImage12Svg(rule, 20, 0);
      const m0 = loadObjects(svg, [ID, ID]);
      expect(painted(m0, { x: 135, y: 235 }, 0)).toBe(true);   // inverted ribbon tail is blue before
      expect(painted(m0, { x: 150, y: 115 }, 0)).toBe(false);  // rosette centre is already a white hole
      expect(painted(m0, { x: 30, y: 40 }, 0)).toBe(true);     // blue background card is painted

      let st = editorState(newSession(m0, [0]));
      const hovered = hoverAt(st, at(135, 235, both));
      expect(hovered.cutRegionHint).not.toBeNull();
      // Coincident curves must NOT shatter the 6-segment ribbon tail into >300 micro-points!
      expect(hovered.cutRegionHint!.length).toBeLessThan(220);
      expect(Math.min(...hovered.cutRegionHint!.map((p) => p.y))).toBeGreaterThan(195);

      // Delete the inverted ribbon tail via Alt+Shift+click
      st = click(hovered, at(135, 235, both));
      const m = st.session.model;
      expect(painted(m, { x: 135, y: 235 }, 0)).toBe(false);   // ribbon tail is gone!
      expect(painted(m, { x: 185, y: 260 }, 0)).toBe(false);   // right fork tip is gone!
      expect(painted(m, { x: 150, y: 115 }, 0)).toBe(false);   // rosette interior stays white!
      expect(painted(m, { x: 30, y: 40 }, 0)).toBe(true);      // blue card stays painted!

      // Resulting path 0 must keep clean Bezier anchor count (no 24x chord-joint explosion!)
      const owner0Anchors = m.subs.filter((s) => s.owner === 0).reduce((n, s) => n + s.anchors.length, 0);
      expect(owner0Anchors).toBeLessThan(45);

      // Further manipulations (drag fill +20 right, then undo) work cleanly
      st = pointerDown(st, at(30, 40, { target: 0 }));
      st = pointerMove(st, at(50, 40, { target: 0 }));
      st = pointerUp(st);
      expect(painted(st.session.model, { x: 170, y: 115 }, 0)).toBe(false); // shifted rosette hole stays white
      const undone = undoSession(undoSession(st.session)).model;
      expect(painted(undone, { x: 135, y: 235 }, 0)).toBe(true);
    },
  );

  it("completes 20 hovers, boolean tail cut, and post-cut drag on a 350+ segment icon in <250ms without freezing", () => {
    const svg = buildImage12Svg("nonzero", 32, 10); // ~350 cubic Bezier segments + coincident 36-seg mask!
    const mats = Array.from({ length: 12 }, () => ID);
    const m0 = loadObjects(svg, mats);
    expect(m0.subs.reduce((n, s) => n + s.anchors.length, 0)).toBeGreaterThan(330);

    let st = editorState(newSession(m0, [0]));

    const tHover = performance.now();
    // Sweep across BOTH the ribbon line border (stretchAt) AND the interior (cellHintAt)
    for (let i = 0; i < 20; i++) {
      st = hoverAt(st, at(105 + i * 2, 260, both));
    }
    st = hoverAt(st, at(135, 235, both));
    const hoverMs = performance.now() - tHover;
    expect(st.cutRegionHint).not.toBeNull();
    expect(hoverMs).toBeLessThan(250);

    const tCut = performance.now();
    st = click(st, at(135, 235, both));
    const cutMs = performance.now() - tCut;
    expect(painted(st.session.model, { x: 135, y: 235 }, 0)).toBe(false);
    expect(cutMs).toBeLessThan(250);

    const tAfter = performance.now();
    for (let i = 0; i < 10; i++) st = hoverAt(st, at(135 + i, 235, both));
    st = pointerDown(st, at(30, 40, { target: 0 }));
    for (let i = 1; i <= 10; i++) st = pointerMove(st, at(30 + i, 40, { target: 0 }));
    st = pointerUp(st);
    const afterMs = performance.now() - tAfter;
    expect(st.drag).toBeNull();
    expect(painted(st.session.model, { x: 40, y: 40 }, 0)).toBe(true);
    expect(afterMs).toBeLessThan(150);
  });

  it("cuts the overhanging inverted ribbon tail inside <SvgPathEditor>, drags afterward, and saves clean SVG", async () => {
    const scale = 2;
    const ctm = () => ({ a: scale, b: 0, c: 0, d: scale, e: 0, f: 0, inverse: () => ({ a: 1 / scale, b: 0, c: 0, d: 1 / scale, e: 0, f: 0 }) });
    const protos = ["Element", "SVGElement", "SVGGraphicsElement", "SVGGeometryElement", "SVGPathElement", "SVGSVGElement"]
      .map((n) => (globalThis as unknown as Record<string, { prototype: object } | undefined>)[n]?.prototype)
      .filter((p): p is object => p !== undefined);
    for (const p of protos) Object.defineProperty(p, "getScreenCTM", { configurable: true, writable: true, value: ctm });
    const host = document.createElement("div");
    document.body.append(host);
    const ui = createRoot(host);
    const onFinish = vi.fn<(markup: string) => void>();
    try {
      const source = buildImage12Svg("nonzero", 18, 0).replace(/ data-edit-path="\d+"/g, "");
      await act(async () => {
        ui.render(<SvgPathEditor source={source} box={{ width: 300, height: 310 }} testid="inv" label="badge" onFinish={onFinish} onCancel={vi.fn()} />);
      });
      const node = host.querySelector("[data-testid=inv]") as HTMLElement;
      const fire = (type: string, x: number, y: number, mods: PointerEventInit = {}) => act(async () => {
        node.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x * scale, clientY: y * scale, pointerId: 1, ...mods }));
      });
      // Alt+Shift hover marks ONLY the protruding ribbon tail
      await fire("pointermove", 135, 235, { altKey: true, shiftKey: true });
      const hint = node.shadowRoot?.querySelector("[data-cut-region]");
      expect(hint).not.toBeNull();

      // Alt+Shift click deletes the ribbon tail, then drag card +15 right and Finish edit
      await fire("pointerdown", 135, 235, { altKey: true, shiftKey: true });
      await fire("pointerup", 135, 235, { altKey: true, shiftKey: true });
      const paths = node.shadowRoot?.querySelectorAll("[data-edit-path]") ?? [];
      await act(async () => {
        paths[0]?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0, clientX: 30 * scale, clientY: 40 * scale, pointerId: 1 }));
      });
      await fire("pointermove", 45, 40);
      await fire("pointerup", 45, 40);
      const finishBtn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes("Finish"));
      await act(async () => { finishBtn?.click(); });
      expect(onFinish).toHaveBeenCalledTimes(1);
      const saved = loadObjects(onFinish.mock.calls[0][0], [ID, ID]);
      expect(painted(saved, { x: 135, y: 235 }, 0)).toBe(false);
      expect(painted(saved, { x: 165, y: 115 }, 0)).toBe(false);
      expect(painted(saved, { x: 45, y: 40 }, 0)).toBe(true);
    } finally {
      act(() => ui.unmount());
      host.remove();
      for (const p of protos) delete (p as { getScreenCTM?: unknown }).getScreenCTM;
    }
  });
});
