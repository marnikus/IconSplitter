// SvgBuilderTextMove.tsx — move the title or subtitle right on the artboard
// (2026-11-14). The ✥ button of the text's quick toolbar opens a dashed frame
// around the text: drag a left/right handle to move it horizontally (a red
// guide and an "X +12 px" badge), a top/bottom handle to move it vertically
// ("Y"), the text itself to move it both ways; arrow keys nudge 1 px (Shift 10).
// Every move is applied to the artboard at once (one coalesced undo gesture);
// Apply only closes the frame.
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { clampTo, RANGES } from "../lib/svgBuilder/ranges";
import type { BuilderApi } from "./useSvgBuilder";

type Which = "title" | "subtitle";
type Axis = "x" | "y" | "xy";
interface Box { x: number; y: number; w: number; h: number }

const KEYS: Record<Which, { dx: "titleDx" | "subtitleDx"; dy: "titleDy" | "subtitleDy" }> = {
  title: { dx: "titleDx", dy: "titleDy" }, subtitle: { dx: "subtitleDx", dy: "subtitleDy" },
};

/** The text block's box on the wrap (screen px), measured after each redraw of the sheet. */
function useTextBox(b: BuilderApi, board: RefObject<HTMLDivElement | null>, wrap: RefObject<HTMLDivElement | null>, which: Which): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const el = board.current?.querySelector(".bld-artboard-svg")?.shadowRoot?.querySelector(`[data-banner-text="${which}"]`);
      const w = wrap.current?.getBoundingClientRect();
      if (el === null || el === undefined || w === undefined) { setBox(null); return; }
      const r = el.getBoundingClientRect();
      setBox({ x: r.left - w.left, y: r.top - w.top, w: r.width, h: r.height });
    });
    return () => cancelAnimationFrame(id);
  }, [b.config, board, wrap, which]);
  return box;
}

export default function SvgBuilderTextMove({ b, board, wrap, which, onDone }: {
  b: BuilderApi; board: RefObject<HTMLDivElement | null>; wrap: RefObject<HTMLDivElement | null>; which: Which; onDone: () => void;
}) {
  const box = useTextBox(b, board, wrap, which);
  const [axis, setAxis] = useState<Axis | null>(null);
  const keys = KEYS[which];
  const banner = b.config.banner;
  const move = useMove(b, which);
  const start = useDrag({ b, wrap, keys, move, setAxis });
  const pad = 6;
  const f = box ?? { x: 0, y: 0, w: 0, h: 0 };
  const nudge = (e: React.KeyboardEvent) => {
    const d = nudgeOf(e);
    if (d === null) return;
    e.preventDefault();
    move(banner[keys.dx] + d[0], banner[keys.dy] + d[1]);
  };
  return <div className="bld-quick-move" data-testid="builder-quick-move-frame" data-which={which}
    style={{ left: f.x - pad, top: f.y - pad, width: f.w + 2 * pad, height: f.h + 2 * pad }}
    tabIndex={0} onKeyDown={nudge} aria-label={`Move the ${which}: drag a side handle or the text, arrows nudge`}>
    <MoveHandles start={start} axis={axis} />
    <span className="bld-quick-move-badge" data-testid="builder-quick-move-badge">{badgeText(axis, banner[keys.dx], banner[keys.dy])}</span>
    <button type="button" className="svg-btn primary tiny bld-quick-move-apply" data-testid="builder-quick-move-apply" onClick={onDone}>Apply</button>
  </div>;
}

/** Arrow keys: 1 px, Shift: 10 px. */
function nudgeOf(e: React.KeyboardEvent): [number, number] | null {
  const step = e.shiftKey ? 10 : 1;
  const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  return d[e.key] ?? null;
}

/** Sets the text's offset (clamped, rounded): one coalesced undo gesture per drag or nudge burst. */
function useMove(b: BuilderApi, which: Which): (dx: number, dy: number) => void {
  const latest = useRef(b);
  latest.current = b;
  return useCallback((dx: number, dy: number) => {
    const keys = KEYS[which];
    const c = latest.current.config;
    const next = { [keys.dx]: clampTo(RANGES.textOffset, Math.round(dx)), [keys.dy]: clampTo(RANGES.textOffset, Math.round(dy)) };
    latest.current.actions.setConfig({ ...c, banner: { ...c.banner, ...next } }, which === "title" ? "Move title" : "Move subtitle", true);
  }, [which]);
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** "X +12 px" while a side handle moves, "Y −8 px" for top/bottom, both for the text itself. */
function badgeText(axis: Axis | null, dx: number, dy: number): string {
  if (axis === "y") return `Y ${signed(dy)} px`;
  if (axis === "xy") return `X ${signed(dx)} · Y ${signed(dy)} px`;
  return `X ${signed(dx)} px`;
}

/** The frame's grips: the text itself (both axes), left/right (X), top/bottom (Y), and the red guide while dragging. */
function MoveHandles({ start, axis }: { start: (e: ReactPointerEvent, axis: Axis) => void; axis: Axis | null }) {
  return <>
    <div className="bld-quick-move-body" data-testid="builder-quick-move-body" onPointerDown={(e) => start(e, "xy")} />
    <span className="bld-quick-move-h is-left" data-testid="builder-quick-move-left" onPointerDown={(e) => start(e, "x")} />
    <span className="bld-quick-move-h is-right" data-testid="builder-quick-move-right" onPointerDown={(e) => start(e, "x")} />
    <span className="bld-quick-move-v is-top" data-testid="builder-quick-move-top" onPointerDown={(e) => start(e, "y")} />
    <span className="bld-quick-move-v is-bottom" data-testid="builder-quick-move-bottom" onPointerDown={(e) => start(e, "y")} />
    {axis !== null && axis !== "y" && <span className="bld-quick-move-guide is-x" aria-hidden="true" />}
    {axis !== null && axis !== "x" && <span className="bld-quick-move-guide is-y" aria-hidden="true" />}
  </>;
}

/** Pointer drag: screen px become artboard px (÷ zoom); the move is applied on every step. */
interface DragArgs {
  b: BuilderApi;
  wrap: RefObject<HTMLDivElement | null>;
  keys: { dx: "titleDx" | "subtitleDx"; dy: "titleDy" | "subtitleDy" };
  move: (dx: number, dy: number) => void;
  setAxis: (a: Axis | null) => void;
}

function useDrag({ b, wrap, keys, move, setAxis }: DragArgs) {
  return (e: ReactPointerEvent, axis: Axis) => {
    e.preventDefault();
    e.stopPropagation();
    const shown = wrap.current?.getBoundingClientRect().width ?? 0;
    const zoom = shown > 0 ? shown / b.config.artboard.width : 1;
    const from = { x: e.clientX, y: e.clientY, dx: b.config.banner[keys.dx], dy: b.config.banner[keys.dy] };
    setAxis(axis);
    const onMove = (ev: PointerEvent) => {
      const ddx = axis === "y" ? 0 : (ev.clientX - from.x) / zoom;
      const ddy = axis === "x" ? 0 : (ev.clientY - from.y) / zoom;
      move(from.dx + ddx, from.dy + ddy);
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); setAxis(null); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
}
