// SvgBuilderGapHandles.tsx — drag the gaps between icons right on the artboard
// (2026-11-14). Only while ▦ Guides is on: every gap between two neighbouring
// icons is an invisible strip; near it a grip shows ("‖" Gap X, "=" Gap Y), and
// dragging the strip changes that gap. One undo step per drag, live badge.
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { gapAfter, gapStrips, type GapStrip } from "../lib/svgBuilder/gapdrag";
import { dragGesture, trackDrag } from "./trackdrag";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderGapHandles({ b, zoom }: { b: BuilderApi; zoom: number }) {
  const [active, setActive] = useState<string | null>(null);
  if (!b.prefs.showGuides) return null;
  const start = (e: ReactPointerEvent, s: GapStrip) => {
    const from = b.config, key = s.axis === "x" ? "gapX" : "gapY", fit = b.layout.fitScale;
    const gesture = dragGesture(`gap-${s.axis}`);
    setActive(s.id);
    trackDrag(e, zoom, (d) => b.actions.setConfig({ ...from, grid: { ...from.grid, [key]: gapAfter(s.axis, from.grid[key], d, fit) } },
      s.axis === "x" ? "Gap X" : "Gap Y", gesture), () => setActive(null));
  };
  const z = zoom > 0 ? zoom : 1;
  return <div className={`bld-gaps${active !== null ? " is-dragging" : ""}`}>
    {gapStrips(b.config, b.layout).map((s) => <span key={s.id} data-testid={`builder-gap-${s.id}`}
      className={`bld-gap-zone is-${s.axis}${active === s.id ? " is-on" : ""}`} title={s.axis === "x" ? "Drag: gap between columns" : "Drag: gap between rows"}
      style={{ left: s.zone.x, top: s.zone.y, width: s.zone.width, height: s.zone.height, ["--edge-z" as string]: String(1 / z) }}
      onPointerDown={(e) => start(e, s)}>
      <span className="bld-gap-grip" aria-hidden="true" />
      {active === s.id && <span className="bld-edge-badge" data-testid="builder-gap-badge">
        {s.axis === "x" ? `Gap X ${b.config.grid.gapX} px` : `Gap Y ${b.config.grid.gapY} px`}</span>}
    </span>)}
  </div>;
}
