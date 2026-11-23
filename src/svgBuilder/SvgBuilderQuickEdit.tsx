// SvgBuilderQuickEdit.tsx — quick editing right on the artboard (2026-11-14).
// Hover an icon, the banner icon, the title, the subtitle, the banner or the
// background: a small toolbar appears beside it — ● its colour, ≡ its stroke
// (icons), A its font and size (texts). Each opens a small panel; the colour
// panel offers smart swatches near the current colour, a custom picker and a hex
// field. Every change goes through setConfig (one undo entry; sliders coalesce).
// The toolbar sits outside the scaled artboard, so it never scales with zoom.
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { cleanHex, smartSwatches } from "../lib/svgBuilder/swatches";
import { bothScale, withBothScale } from "../lib/svgBuilder/herosize";
import { RANGES } from "../lib/svgBuilder/ranges";
import type { TitleFace , TextCase } from "../lib/svgBuilder/types";
import { QUICK_SPECS, isIconKind, quickTargetOf, slotValue, withSlot, type ColorSlot, type QuickKind, type QuickSpec, type SizeSlot } from "./quickedit";
import type { BuilderApi } from "./useSvgBuilder";
import SvgBuilderTextMove from "./SvgBuilderTextMove";
import { anchorOf } from "./quickplace";
import { canRebalance, isColumn, rebalanceSpan, rebalancedBanner } from "../lib/svgBuilder/rebalance";
import RowProportions from "./SvgBuilderRowProportions";
import SvgBuilderTextWidth from "./SvgBuilderTextWidth";

type Panel = "color" | "fill" | "stroke" | "text" | "move" | "ring" | "scale" | "width" | "box" | "rebalance" | null;
interface Hover { kind: QuickKind; el: Element }

const FACES: ReadonlyArray<{ value: TitleFace; label: string }> = [
  { value: "sans", label: "Grotesk (sans)" }, { value: "serif", label: "Editorial (serif)" }, { value: "mono", label: "Mono" },
];
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
      const inside = e.target instanceof Element && e.target.closest(".bld-quick, .bld-quick-move, .bld-text-width") !== null;
      if (!inside) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [panel, close]);
}

/** ⇔ on the banner and on a split banner's coloured block, for top / bottom banners (2026-11-16). */
const offersRebalance = (b: BuilderApi, kind: QuickKind) => (kind === "banner" || kind === "block") && canRebalance(b.config.banner);

const isText = (kind: QuickKind): kind is "title" | "subtitle" => kind === "title" || kind === "subtitle";

/**
 * While a panel is open the toolbar stays exactly where it opened (2026-11-14):
 * editing a value resizes the element, and a toolbar that followed it jumped
 * away from the pointer mid-edit. It moves again only after the panel closes.
 */
function usePinnedAnchor<T>(live: T | null, pinned: boolean): T | null {
  const [frozen, setFrozen] = useState<T | null>(null);
  if (pinned && frozen === null && live !== null) setFrozen(live);
  if (!pinned && frozen !== null) setFrozen(null);
  return pinned && frozen !== null ? frozen : live;
}

export default function SvgBuilderQuickEdit({ b, board, wrap }: { b: BuilderApi; board: RefObject<HTMLDivElement | null>; wrap: RefObject<HTMLDivElement | null> }) {
  const [panel, setPanel] = useState<Panel>(null);
  const { hover, keep, later, clear } = useQuickHover(board, panel !== null);
  const done = useCallback(() => { setPanel(null); clear(); }, [clear]);
  useDismissPanel(panel, done);
  useEffect(() => { if (hover === null && panel !== null) setPanel(null); }, [hover, panel]); // a panel never outlives its toolbar
  const live = hover === null || wrap.current === null ? null : anchorOf(hover, b, { board: board.current, wrap: wrap.current });
  const at = usePinnedAnchor(live, panel !== null);
  if (hover === null || at === null) return null;
  const kind = hover.kind;
  return <>
    <div className="bld-quick" data-testid="builder-quick" data-kind={kind}
      style={{ left: at.x, top: at.y }} onMouseEnter={keep} onMouseMove={keep} onMouseLeave={() => { if (panel === null) later(); }}>
      <QuickBar b={b} kind={kind} panel={panel} el={hover.el} toggle={(next) => setPanel(panel === next ? null : next)} />
      <QuickPanel b={b} kind={kind} panel={panel} done={done} move={{ board, wrap, anchor: at }} />
    </div>
    {isText(kind) && (panel === null || panel === "width") && <SvgBuilderTextWidth b={b} which={kind} el={hover.el} board={board} wrap={wrap}
      onDrag={(on) => setPanel(on ? "width" : null)} onEnter={keep} />}
  </>;
}

/** ⇔ on an edge banner (2026-11-15): rebalance the row now, or keep it balanced automatically. */
function RebalancePanel({ b }: { b: BuilderApi }) {
  const banner = b.config.banner;
  const set = (patch: Partial<typeof banner>, label: string) => b.actions.setConfig({ ...b.config, banner: { ...banner, ...patch } }, label);
  return <div className="bld-quick-panel" data-testid="builder-quick-rebalance-panel">
    <button type="button" className="svg-btn tiny primary" data-testid="builder-quick-rebalance-now" onClick={() => set(rebalancedBanner(banner, rebalanceSpan(banner, b.layout.banner, b.config.artboard)), "Rebalance")}>{isColumn(banner) ? "⇔ Rebalance column now" : "⇔ Rebalance row now"}</button>
    <label className="bld-quick-row"><input type="checkbox" data-testid="builder-quick-rebalance-auto" checked={banner.autoRebalance}
      onChange={(e) => set(e.target.checked ? { autoRebalance: true, ...rebalancedBanner(banner, rebalanceSpan(banner, b.layout.banner, b.config.artboard)) } : { autoRebalance: false }, "Auto rebalance")} /> Auto rebalance</label>
    <RowProportions banner={banner} prefix="builder-quick" onChange={(patch) => b.actions.setConfig({ ...b.config, banner: { ...banner, ...patch } }, "Rebalance proportions", true)} />
  </div>;
}

/** ✎ on an icon (2026-11-15): Generate SVG's editor on this icon, right from the artboard. */
function IconEditButton({ b, el }: { b: BuilderApi; el: Element }) {
  const id = el.getAttribute("data-asset-id") ?? el.closest("[data-asset-id]")?.getAttribute("data-asset-id") ?? null;
  if (id === null) return null;
  return <button type="button" className="bld-quick-btn" data-testid="builder-quick-edit-icon" title="Edit this icon's shapes (Generate SVG's editor)"
    aria-label="Edit this icon" onClick={() => b.actions.openIconEditor(id)}>✎</button>;
}

function QuickBar({ b, kind, panel, el, toggle }: { b: BuilderApi; kind: QuickKind; panel: Panel; el: Element; toggle: (p: Exclude<Panel, null>) => void }) {
  const spec = QUICK_SPECS[kind];
  return <div className="bld-quick-bar" role="toolbar" aria-label={`Quick edit: ${spec.name}`}>
    <ColorDot b={b} slot={spec.color} testid="builder-quick-color" ring={spec.fill !== undefined} onClick={() => toggle("color")} />
    {spec.fill && <ColorDot b={b} slot={spec.fill} testid="builder-quick-fill" ring={false} onClick={() => toggle("fill")} />}
    {spec.stroke && <button type="button" className="bld-quick-btn" data-testid="builder-quick-stroke" title={spec.stroke.label}
      aria-label={spec.stroke.label} onClick={() => toggle("stroke")}>≡</button>}
    {spec.text && <button type="button" className="bld-quick-btn bld-quick-a" data-testid="builder-quick-text" title="Font and size"
      aria-label="Font and size" onClick={() => toggle("text")}>A</button>}
    {isText(kind) && <button type="button" className={`bld-quick-btn${panel === "move" ? " is-on" : ""}`}
      data-testid="builder-quick-move" title="Move this text right on the artboard" aria-label="Move this text"
      onClick={() => toggle("move")}>✥</button>}
    {kind === "hero" && <HeroButtons toggle={toggle} />}
    {spec.box && <button type="button" className="bld-quick-btn" data-testid="builder-quick-box" title={spec.box.label}
      aria-label={spec.box.label} onClick={() => toggle("box")}>⬚</button>}
    {isIconKind(kind) && <IconEditButton b={b} el={el} />}
    {offersRebalance(b, kind) && <button type="button" className="bld-quick-btn" data-testid="builder-quick-rebalance"
      title="Rebalance the row: one line each, equal gaps" aria-label="Rebalance the banner row" onClick={() => toggle("rebalance")}>⇔</button>}
  </div>;
}

interface MoveCtx { board: RefObject<HTMLDivElement | null>; wrap: RefObject<HTMLDivElement | null>; anchor: { x: number; y: number } }

/** The colour a panel edits: the element's colour, or a colored icon's fill colour (2026-11-23). */
const colorSlotOf = (spec: QuickSpec, panel: Panel): ColorSlot | undefined => (panel === "color" ? spec.color : panel === "fill" ? spec.fill : undefined);

function QuickPanel({ b, kind, panel, done, move }: { b: BuilderApi; kind: QuickKind; panel: Panel; done: () => void; move: MoveCtx }) {
  const spec = QUICK_SPECS[kind];
  const color = colorSlotOf(spec, panel);
  if (color !== undefined) return <ColorPanel b={b} slot={color} onDone={done} />;
  if (panel === "stroke" && spec.stroke) return <SizePanel b={b} slot={spec.stroke} testid="builder-quick-stroke-range" />;
  if (panel === "box" && spec.box) return <SizePanel b={b} slot={spec.box} testid="builder-quick-box-range" />;
  if (panel === "rebalance" && offersRebalance(b, kind)) return <RebalancePanel b={b} />;
  if (panel === "text" && spec.text) return <TextPanel b={b} slot={spec.text} face={spec.face === true} gap={spec.gap} textCase={spec.textCase} />;
  return <KindPanel b={b} kind={kind} panel={panel} done={done} move={move} />;
}

/** Panels only some elements have: a text's move frame, the banner icon's circle and sizes. */
function KindPanel({ b, kind, panel, done, move }: { b: BuilderApi; kind: QuickKind; panel: Panel; done: () => void; move: MoveCtx }) {
  if (kind === "hero" && (panel === "ring" || panel === "scale")) return <HeroPanel b={b} panel={panel} />;
  if (panel === "move" && isText(kind)) return <MovePortal b={b} board={move.board} wrap={move.wrap} which={kind} anchor={move.anchor} onDone={done} />;
  return null;
}

/** The banner icon's own extra buttons (2026-11-14): its circle, and the size of both. */
function HeroButtons({ toggle }: { toggle: (p: Exclude<Panel, null>) => void }) {
  return <>
    <button type="button" className="bld-quick-btn" data-testid="builder-quick-ring" title="Circle: stroke and size" aria-label="Circle stroke and size"
      onClick={() => toggle("ring")}>◯</button>
    <button type="button" className="bld-quick-btn" data-testid="builder-quick-scale" title="Size: icon, circle, or both at once" aria-label="Icon and circle size"
      onClick={() => toggle("scale")}>⤢</button>
  </>;
}

const RING_STROKE = { label: "Circle stroke", group: "banner" as const, key: "ringStroke", range: RANGES.ringStroke, unit: "px" };
const RING_SIZE = { label: "Circle size", group: "banner" as const, key: "ringScale", range: RANGES.ringScale, unit: "%" };
const HERO_SIZE = { label: "Icon size", group: "banner" as const, key: "heroScale", range: RANGES.heroScale, unit: "%" };

/** ◯: the circle's stroke and size. ⤢: icon size, circle size, and both together (their ratio kept). */
function HeroPanel({ b, panel }: { b: BuilderApi; panel: "ring" | "scale" }) {
  if (panel === "ring") {
    return <div className="bld-quick-stack" data-testid="builder-quick-ring-panel">
      <SizePanel b={b} slot={RING_STROKE} testid="builder-quick-ring-stroke" />
      <SizePanel b={b} slot={RING_SIZE} testid="builder-quick-ring-size" />
    </div>;
  }
  const banner = b.config.banner;
  return <div className="bld-quick-stack" data-testid="builder-quick-scale-panel">
    <div className="bld-quick-panel">
      <div className="bld-quick-row"><b className="bld-quick-title">Icon + circle</b><span className="bld-quick-value">{bothScale(banner)} %</span></div>
      <input type="range" className="bld-range" data-testid="builder-quick-both" aria-label="Icon and circle size together"
        min={RANGES.heroScale.min} max={RANGES.heroScale.max} step={RANGES.heroScale.step} value={bothScale(banner)}
        onChange={(e) => b.actions.setConfig({ ...b.config, banner: { ...banner, ...withBothScale(banner, Number(e.target.value)) } }, "Icon and circle size", true)} />
    </div>
    <SizePanel b={b} slot={HERO_SIZE} testid="builder-quick-hero-size" />
    <SizePanel b={b} slot={RING_SIZE} testid="builder-quick-ring-size" />
  </div>;
}

/** The toolbar's colour button: the colour, or a many-coloured dot while each icon keeps its OWN (2026-11-23); a ring = a stroke colour. */
function ColorDot({ b, slot, testid, ring, onClick }: { b: BuilderApi; slot: ColorSlot; testid: string; ring: boolean; onClick: () => void }) {
  const value = String(slotValue(b.config, slot));
  return <button type="button" className={`bld-quick-dot${value === "" ? " is-own" : ""}${ring ? " is-ring" : ""}`} data-testid={testid}
    title={value === "" && slot.own ? `${slot.label}: ${slot.own}` : slot.label} aria-label={slot.label}
    style={value === "" ? undefined : ring ? { borderColor: value } : { background: value }} onClick={onClick} />;
}

/** Where the swatches start while each icon keeps its own colour. */
const OWN_START = "#7A869A";

function ColorPanel({ b, slot, onDone }: { b: BuilderApi; slot: ColorSlot; onDone: () => void }) {
  const value = String(slotValue(b.config, slot)).toUpperCase();
  const own = slot.own !== undefined && value === "";
  const current = own ? OWN_START : value;
  const [hex, setHex] = useState(value);
  useEffect(() => { setHex(value); }, [value]);
  const set = (next: string, gesture = false) => b.actions.setConfig(withSlot(b.config, slot, next), slot.label, gesture);
  const commitHex = () => { const clean = cleanHex(hex); if (clean !== null && clean !== value) set(clean); else setHex(value); };
  return <div className="bld-quick-panel" data-testid="builder-quick-color-panel">
    <b className="bld-quick-title">{slot.label}</b>
    {slot.own !== undefined && <OwnRow own={own} label={slot.own} testid="builder-quick-own" onOwn={() => set("")} />}
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

/** "Own …" while each icon keeps its own paint; else ↺ puts the icons' own paint back (2026-11-23). */
function OwnRow({ own, label, testid, onOwn }: { own: boolean; label: string; testid: string; onOwn: () => void }) {
  return own ? <span className="bld-quick-own-note" data-testid={`${testid}-note`}>{label}</span>
    : <button type="button" className="svg-btn tiny" data-testid={testid} onClick={onOwn}>↺ {label}</button>;
}

function SizePanel({ b, slot, testid }: { b: BuilderApi; slot: SizeSlot; testid: string }) {
  const raw = Number(slotValue(b.config, slot));
  const own = slot.own !== undefined && raw === 0;
  const value = own ? b.config.icons.strokeWidth : raw; // an own width starts the slider at the outlined icons' pen
  return <div className="bld-quick-panel" data-testid={`${testid}-panel`}>
    <div className="bld-quick-row"><b className="bld-quick-title">{slot.label}</b><span className="bld-quick-value">{own ? slot.own : `${value} ${slot.unit}`}</span></div>
    {slot.own !== undefined && !own && <OwnRow own={false} label={slot.own} testid={`${testid}-own`} onOwn={() => b.actions.setConfig(withSlot(b.config, slot, 0), slot.label)} />}
    <input type="range" className="bld-range" data-testid={testid} aria-label={slot.label} min={slot.range.min} max={slot.range.max} step={slot.range.step}
      value={value} onChange={(e) => b.actions.setConfig(withSlot(b.config, slot, Number(e.target.value)), slot.label, true)} />
    <div className="bld-quick-row bld-quick-ends"><span>{slot.range.min}</span><span>{slot.range.max}</span></div>
  </div>;
}

function TextPanel({ b, slot, face, gap, textCase }: { b: BuilderApi; slot: SizeSlot; face: boolean; gap?: SizeSlot; textCase?: "titleCase" | "subtitleCase" }) {
  return <div className="bld-quick-panel" data-testid="builder-quick-text-panel">
    {face && <label className="bld-quick-row"><b className="bld-quick-title">Font</b>
      <select className="svg-input bld-quick-face" data-testid="builder-quick-face" value={b.config.banner.titleFace} aria-label="Title font"
        onChange={(e) => b.actions.setConfig({ ...b.config, banner: { ...b.config.banner, titleFace: e.target.value as TitleFace } }, "Title font")}>
        {FACES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select></label>}
    {textCase !== undefined && <CaseRow b={b} field={textCase} />}
    <SizePanel b={b} slot={slot} testid="builder-quick-size" />
    {gap !== undefined && <SizePanel b={b} slot={gap} testid="builder-quick-gap" />}
  </div>;
}

const CASES: readonly [TextCase, string][] = [["normal", "Aa"], ["capitalized", "Ab Cd"], ["upper", "AB"]];

/** normal / Capitalized / UPPER for the title or the subtitle (2026-11-15). */
function CaseRow({ b, field }: { b: BuilderApi; field: "titleCase" | "subtitleCase" }) {
  const current = b.config.banner[field];
  return <div className="bld-quick-row" role="radiogroup" aria-label="Text case"><b className="bld-quick-title">Case</b>
    <span className="bld-quick-cases">{CASES.map(([value, label]) => <button type="button" key={value} role="radio" aria-checked={current === value}
      className={`bld-quick-case${current === value ? " is-on" : ""}`} data-testid={`builder-quick-case-${value}`}
      onClick={() => b.actions.setConfig({ ...b.config, banner: { ...b.config.banner, [field]: value } }, "Text case")}>{label}</button>)}</span>
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
