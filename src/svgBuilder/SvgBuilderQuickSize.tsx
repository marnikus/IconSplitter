// SvgBuilderQuickSize.tsx — the quick toolbar's slider panel and its "own" row
// (2026-11-14; own file 2026-11-23 so the toolbar file keeps its size budget).
import type { BuilderApi } from "./useSvgBuilder";
import { slotValue, withSlot, type SizeSlot } from "./quickedit";

/** "Own …" while each icon keeps its own paint; else ↺ puts the icons' own paint back (2026-11-23). */
export function OwnRow({ own, label, testid, onOwn }: { own: boolean; label: string; testid: string; onOwn: () => void }) {
  return own ? <span className="bld-quick-own-note" data-testid={`${testid}-note`}>{label}</span>
    : <button type="button" className="svg-btn tiny" data-testid={testid} onClick={onOwn}>↺ {label}</button>;
}

export function SizePanel({ b, slot, testid }: { b: BuilderApi; slot: SizeSlot; testid: string }) {
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
