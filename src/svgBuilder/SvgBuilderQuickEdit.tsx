// SvgBuilderQuickEdit.tsx — quick editing right on the artboard (2026-11-14).
// Hover an icon, the banner icon, the title, the subtitle, the banner or the
// background: a small toolbar appears beside it — ● its colour, ≡ its stroke
// (icons), A its font and size (texts). Each opens a small panel; the colour
// panel offers smart swatches near the current colour, a custom picker and a hex
// field. Every change goes through setConfig (one undo entry; sliders coalesce).
// The toolbar sits outside the scaled artboard, so it never scales with zoom.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cleanHex, smartSwatches } from "../lib/svgBuilder/swatches";
import type { TitleFace } from "../lib/svgBuilder/types";
import { QUICK_SPECS, quickTargetOf, slotValue, withSlot, type ColorSlot, type QuickKind, type SizeSlot } from "./quickedit";
import type { BuilderApi } from "./useSvgBuilder";
import SvgBuilderTextMove from "./SvgBuilderTextMove";

type Panel = "color" | "stroke" | "text" | "move" | null;
interface Hover { kind: QuickKind; el: Element }
interface Anchor { x: number; y: number; inside: boolean }

const FACES: ReadonlyArray<{ value: TitleFace; label: string }> = [
  { value: "sans", label: "Grotesk (sans)" }, { value: "serif", label: "Editorial (serif)" }, { value: "mono", label: "Mono" },
];
/**
 * The toolbar's ONE place for an element (2026-11-14), from the artboard's own
 * geometry — never the pointer: the background at the top-right of the grid
 * area, the banner at its top-right, the split block at its top-right (all
 * inside, the toolbar's right edge there), an icon / text / banner icon beside
 * it. It moves only when the layout moves (grid, banner size, padding, text).
 */
export function anchorOf(hover: Hover, b: BuilderApi, nodes: { board: HTMLElement | null; wrap: HTMLElement }): Anchor | null {
  const { kind, el } = hover;
  const { board, wrap } = nodes;
  const w = wrap.getBoundingClientRect();
  const zoom = w.width > 0 ? w.width / b.config.artboard.width : 1;
  const inside = (r: { x: number; y: number; width: number }) => ({ x: (r.x + r.width) * zoom - 8, y: r.y * zoom + 8, inside: true });
  if (kind === "canvas") return inside(b.layout.content);
  if (kind === "banner") return b.layout.banner === null ? null : inside(b.layout.banner);
  const live = liveElement(kind, el, board);
  if (live === null) return null;
  const r = live.getBoundingClientRect();
  if (kind === "block") return { x: r.right - w.left - 8, y: r.top - w.top + 8, inside: true };
  return { x: r.right - w.left + 6, y: r.top - w.top, inside: false };
}

/** The element as the sheet shows it now: a redraw replaces the shadow SVG, so marked parts are looked up again. */
function liveElement(kind: QuickKind, el: Element, board: HTMLElement | null): Element | null {
  if (el.isConnected) return el;
  const root = board?.querySelector(".bld-artboard-svg")?.shadowRoot ?? null;
  const selector = LIVE_SELECTOR[kind];
  return selector === undefined || root === null ? null : root.querySelector(selector);
}

const LIVE_SELECTOR: Partial<Record<QuickKind, string>> = {
  title: '[data-banner-text="title"]', subtitle: '[data-banner-text="subtitle"]', hero: "[data-banner-hero]", block: "[data-split-block]",
};

function useQuickHover(board: RefObject<HTMLDivElement | null>, pinned: boolean) {
  const [hover, setHover] = useState<Hover | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;
  const keep = useCallback(() => { if (hide.current !== null) { clearTimeout(hide.current); hide.current = null; } }, []);
  // Never hides while a panel is open (2026-11-14): that left an open panel with no toolbar, and hovering stopped for good.
  const later = useCallback(() => {
    keep();
    hide.current = setTimeout(() => { if (!pinnedRef.current) setHover(null); }, 400);
  }, [keep]);
  const clear = useCallback(() => { keep(); setHover(null); }, [keep]);
  useEffect(() => {
    const node = board.current;
    if (node === null || pinned) return undefined;
    const onMove = (e: MouseEvent) => {
      const t = quickTargetOf(e.composedPath());
      if (t === null) return;
      keep();
      setHover((h) => (h !== null && h.kind === t.kind && h.el === t.el ? h : { kind: t.kind, el: t.el }));
    };
    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", later);
    return () => { node.removeEventListener("mousemove", onMove); node.removeEventListener("mouseleave", later); };
  }, [board, pinned, keep, later]);
  return { hover, keep, later, clear };
}

/** Closes the open panel on an outside click or Escape. */
function useDismissPanel(panel: Panel, close: () => void): void {
  useEffect(() => {
    if (panel === null) return undefined;
    const onDown = (e: MouseEvent) => {
      const inside = e.target instanceof Element && e.target.closest(".bld-quick, .bld-quick-move") !== null;
      if (!inside) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [panel, close]);
}

const isText = (kind: QuickKind): kind is "title" | "subtitle" => kind === "title" || kind === "subtitle";

export default function SvgBuilderQuickEdit({ b, board, wrap }: { b: BuilderApi; board: RefObject<HTMLDivElement | null>; wrap: RefObject<HTMLDivElement | null> }) {
  const [panel, setPanel] = useState<Panel>(null);
  const { hover, keep, later, clear } = useQuickHover(board, panel !== null);
  const done = useCallback(() => { setPanel(null); clear(); }, [clear]);
  useDismissPanel(panel, done);
  useEffect(() => { if (hover === null && panel !== null) setPanel(null); }, [hover, panel]); // a panel never outlives its toolbar
  const at = hover === null || wrap.current === null ? null : anchorOf(hover, b, { board: board.current, wrap: wrap.current });
  if (hover === null || at === null) return null;
  return <div className={`bld-quick${at.inside ? " is-inside" : ""}`} data-testid="builder-quick" data-kind={hover.kind}
    style={{ left: at.x, top: at.y }} onMouseEnter={keep} onMouseMove={keep} onMouseLeave={() => { if (panel === null) later(); }}>
    <QuickBar b={b} kind={hover.kind} panel={panel} toggle={(next) => setPanel(panel === next ? null : next)} />
    <QuickPanel b={b} kind={hover.kind} panel={panel} done={done} move={{ board, wrap, anchor: at }} />
  </div>;
}

function QuickBar({ b, kind, panel, toggle }: { b: BuilderApi; kind: QuickKind; panel: Panel; toggle: (p: Exclude<Panel, null>) => void }) {
  const spec = QUICK_SPECS[kind];
  return <div className="bld-quick-bar" role="toolbar" aria-label={`Quick edit: ${spec.name}`}>
    <button type="button" className="bld-quick-dot" data-testid="builder-quick-color" title={spec.color.label} aria-label={spec.color.label}
      style={{ background: String(slotValue(b.config, spec.color)) }} onClick={() => toggle("color")} />
    {spec.stroke && <button type="button" className="bld-quick-btn" data-testid="builder-quick-stroke" title={spec.stroke.label}
      aria-label={spec.stroke.label} onClick={() => toggle("stroke")}>≡</button>}
    {spec.text && <button type="button" className="bld-quick-btn bld-quick-a" data-testid="builder-quick-text" title="Font and size"
      aria-label="Font and size" onClick={() => toggle("text")}>A</button>}
    {isText(kind) && <button type="button" className={`bld-quick-btn${panel === "move" ? " is-on" : ""}`}
      data-testid="builder-quick-move" title="Move this text right on the artboard" aria-label="Move this text"
      onClick={() => toggle("move")}>✥</button>}
  </div>;
}

interface MoveCtx { board: RefObject<HTMLDivElement | null>; wrap: RefObject<HTMLDivElement | null>; anchor: { x: number; y: number } }

function QuickPanel({ b, kind, panel, done, move }: { b: BuilderApi; kind: QuickKind; panel: Panel; done: () => void; move: MoveCtx }) {
  const spec = QUICK_SPECS[kind];
  if (panel === "color") return <ColorPanel b={b} slot={spec.color} onDone={done} />;
  if (panel === "stroke" && spec.stroke) return <SizePanel b={b} slot={spec.stroke} testid="builder-quick-stroke-range" />;
  if (panel === "text" && spec.text) return <TextPanel b={b} slot={spec.text} face={spec.face === true} />;
  if (panel === "move" && isText(kind)) return <MovePortal b={b} board={move.board} wrap={move.wrap} which={kind} anchor={move.anchor} onDone={done} />;
  return null;
}

function ColorPanel({ b, slot, onDone }: { b: BuilderApi; slot: ColorSlot; onDone: () => void }) {
  const current = String(slotValue(b.config, slot)).toUpperCase();
  const [hex, setHex] = useState(current);
  useEffect(() => { setHex(current); }, [current]);
  const set = (value: string, gesture = false) => b.actions.setConfig(withSlot(b.config, slot, value), slot.label, gesture);
  const commitHex = () => { const clean = cleanHex(hex); if (clean !== null && clean !== current) set(clean); else setHex(current); };
  return <div className="bld-quick-panel" data-testid="builder-quick-color-panel">
    <b className="bld-quick-title">{slot.label}</b>
    <div className="bld-quick-swatches">
      {smartSwatches(current).map((c) => <button type="button" key={c} className="bld-quick-dot" data-testid={`builder-quick-swatch-${c.slice(1)}`}
        style={{ background: c }} title={c} aria-label={`Use ${c}`} onClick={() => set(c)} />)}
      <label className="bld-quick-dot bld-quick-custom" title="Custom color">
        <input type="color" data-testid="builder-quick-custom" aria-label="Custom color" value={current.toLowerCase()}
          onChange={(e) => set(e.target.value.toUpperCase(), true)} />
      </label>
    </div>
    <div className="bld-quick-row">
      <input className="svg-input bld-quick-hex" data-testid="builder-quick-hex" value={hex} maxLength={7} aria-label="Hex color"
        onChange={(e) => setHex(e.target.value)} onBlur={commitHex} onKeyDown={(e) => { if (e.key === "Enter") commitHex(); }} />
      <button type="button" className="svg-btn primary tiny" data-testid="builder-quick-done" onClick={() => { commitHex(); onDone(); }}>Done</button>
    </div>
  </div>;
}

function SizePanel({ b, slot, testid }: { b: BuilderApi; slot: SizeSlot; testid: string }) {
  const value = Number(slotValue(b.config, slot));
  return <div className="bld-quick-panel" data-testid={`${testid}-panel`}>
    <div className="bld-quick-row"><b className="bld-quick-title">{slot.label}</b><span className="bld-quick-value">{value} {slot.unit}</span></div>
    <input type="range" className="bld-range" data-testid={testid} aria-label={slot.label} min={slot.range.min} max={slot.range.max} step={slot.range.step}
      value={value} onChange={(e) => b.actions.setConfig(withSlot(b.config, slot, Number(e.target.value)), slot.label, true)} />
    <div className="bld-quick-row bld-quick-ends"><span>{slot.range.min}</span><span>{slot.range.max}</span></div>
  </div>;
}

function TextPanel({ b, slot, face }: { b: BuilderApi; slot: SizeSlot; face: boolean }) {
  return <div className="bld-quick-panel" data-testid="builder-quick-text-panel">
    {face && <label className="bld-quick-row"><b className="bld-quick-title">Font</b>
      <select className="svg-input bld-quick-face" data-testid="builder-quick-face" value={b.config.banner.titleFace} aria-label="Title font"
        onChange={(e) => b.actions.setConfig({ ...b.config, banner: { ...b.config.banner, titleFace: e.target.value as TitleFace } }, "Title font")}>
        {FACES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select></label>}
    <SizePanel b={b} slot={slot} testid="builder-quick-size" />
  </div>;
}

/** The move frame is laid out on the wrap: offset back from the toolbar's own position. */
function MovePortal({ b, board, wrap, which, anchor, onDone }: {
  b: BuilderApi; board: RefObject<HTMLDivElement | null>; wrap: RefObject<HTMLDivElement | null>;
  which: "title" | "subtitle"; anchor: { x: number; y: number }; onDone: () => void;
}) {
  return <div className="bld-quick-move-layer" style={{ left: -anchor.x, top: -anchor.y }}>
    <SvgBuilderTextMove b={b} board={board} wrap={wrap} which={which} onDone={onDone} />
  </div>;
}
