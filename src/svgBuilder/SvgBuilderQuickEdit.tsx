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

type Panel = "color" | "stroke" | "text" | null;
interface Hover { kind: QuickKind; el: Element; x: number; y: number }

const FACES: ReadonlyArray<{ value: TitleFace; label: string }> = [
  { value: "sans", label: "Grotesk (sans)" }, { value: "serif", label: "Editorial (serif)" }, { value: "mono", label: "Mono" },
];
const BIG: ReadonlySet<QuickKind> = new Set(["banner", "canvas", "block"]);

/** Where the toolbar goes: beside small elements, at the pointer over big ones. */
function placeOf(kind: QuickKind, el: Element, e: MouseEvent, wrap: HTMLElement): { x: number; y: number } {
  const w = wrap.getBoundingClientRect();
  if (BIG.has(kind)) return { x: e.clientX - w.left + 14, y: e.clientY - w.top - 14 };
  const r = el.getBoundingClientRect();
  return { x: r.right - w.left + 6, y: r.top - w.top };
}

function useQuickHover(board: RefObject<HTMLDivElement | null>, wrap: RefObject<HTMLDivElement | null>, pinned: boolean) {
  const [hover, setHover] = useState<Hover | null>(null);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keep = useCallback(() => { if (hide.current !== null) { clearTimeout(hide.current); hide.current = null; } }, []);
  const later = useCallback(() => { keep(); hide.current = setTimeout(() => setHover(null), 400); }, [keep]);
  const clear = useCallback(() => { keep(); setHover(null); }, [keep]);
  useEffect(() => {
    const node = board.current;
    if (node === null || pinned) return undefined;
    const onMove = (e: MouseEvent) => {
      const t = quickTargetOf(e.composedPath());
      if (t === null || wrap.current === null) return;
      keep();
      // Fixed while the pointer stays on the same element (2026-11-14): over a big
      // area it is placed once, where the pointer entered — never chasing it.
      setHover((h) => (h !== null && h.kind === t.kind && h.el === t.el ? h : { kind: t.kind, el: t.el, ...placeOf(t.kind, t.el, e, wrap.current as HTMLElement) }));
    };
    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", later);
    return () => { node.removeEventListener("mousemove", onMove); node.removeEventListener("mouseleave", later); };
  }, [board, wrap, pinned, keep, later]);
  return { hover, keep, later, clear };
}

export default function SvgBuilderQuickEdit({ b, board, wrap }: { b: BuilderApi; board: RefObject<HTMLDivElement | null>; wrap: RefObject<HTMLDivElement | null> }) {
  const [panel, setPanel] = useState<Panel>(null);
  const { hover, keep, later, clear } = useQuickHover(board, wrap, panel !== null);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (panel === null) return undefined;
    const onDown = (e: MouseEvent) => { if (box.current !== null && !box.current.contains(e.target as Node)) { setPanel(null); clear(); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setPanel(null); clear(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [panel, clear]);
  if (hover === null) return null;
  const spec = QUICK_SPECS[hover.kind];
  const done = () => { setPanel(null); clear(); };
  return <div ref={box} className="bld-quick" data-testid="builder-quick" data-kind={hover.kind} style={{ left: hover.x, top: hover.y }}
    onMouseEnter={keep} onMouseLeave={() => { if (panel === null) later(); }}>
    <div className="bld-quick-bar" role="toolbar" aria-label={`Quick edit: ${spec.name}`}>
      <button type="button" className="bld-quick-dot" data-testid="builder-quick-color" title={spec.color.label} aria-label={spec.color.label}
        style={{ background: String(slotValue(b.config, spec.color)) }} onClick={() => setPanel(panel === "color" ? null : "color")} />
      {spec.stroke && <button type="button" className="bld-quick-btn" data-testid="builder-quick-stroke" title={spec.stroke.label}
        aria-label={spec.stroke.label} onClick={() => setPanel(panel === "stroke" ? null : "stroke")}>≡</button>}
      {spec.text && <button type="button" className="bld-quick-btn bld-quick-a" data-testid="builder-quick-text" title="Font and size"
        aria-label="Font and size" onClick={() => setPanel(panel === "text" ? null : "text")}>A</button>}
    </div>
    {panel === "color" && <ColorPanel b={b} slot={spec.color} onDone={done} />}
    {panel === "stroke" && spec.stroke && <SizePanel b={b} slot={spec.stroke} testid="builder-quick-stroke-range" />}
    {panel === "text" && spec.text && <TextPanel b={b} slot={spec.text} face={spec.face === true} />}
  </div>;
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
