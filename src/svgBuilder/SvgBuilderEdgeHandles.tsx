// SvgBuilderEdgeHandles.tsx — grips on the artboard (2026-11-14): the banner's
// inner edge resizes the banner, the icon area's padding edges change the
// padding (the artboard size grips sit outside it: SvgBuilderSizeHandles). Preview-only overlay in artboard pixels (the board is scaled by
// `zoom`); each drag is one coalesced undo step, with a live value badge.
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { bannerSizeAfter, edgeHandles, paddingAfter, type EdgeHandle } from "../lib/svgBuilder/edgedrag";
import type { SheetConfig } from "../lib/svgBuilder/types";
import type { BuilderApi } from "./useSvgBuilder";
import { dragGesture, trackDrag } from "./trackdrag";

/** The sheet after a drag of (dx, dy) artboard pixels from the start config. */
function dragged(start: SheetConfig, h: EdgeHandle, d: { dx: number; dy: number }): SheetConfig {
  if (h.kind === "banner") return { ...start, banner: { ...start.banner, size: bannerSizeAfter(start, start.banner.size, d) } };
  return { ...start, artboard: { ...start.artboard, padding: paddingAfter(h.side, start.artboard.padding, d) } };
}

const LABEL: Record<EdgeHandle["kind"], (side: string) => string> = {
  banner: () => "Banner size", pad: (side) => `Padding (${side} edge)`,
};
const TITLE: Record<EdgeHandle["kind"], string> = {
  banner: "Drag: banner size", pad: "Drag: padding around the icons",
};

/** The live badge while dragging. */
function badgeOf(c: SheetConfig, h: EdgeHandle): string {
  if (h.kind === "banner") return `${c.banner.size} px`;
  return `Pad ${c.artboard.padding} px`;
}

function useEdgeDrag(b: BuilderApi, zoom: number, setActive: (id: string | null) => void) {
  return (e: ReactPointerEvent, h: EdgeHandle) => {
    const start = b.config;
    const label = LABEL[h.kind](h.side);
    const gesture = dragGesture(`edge-${h.id}`); // this drag = one undo step
    setActive(h.id);
    trackDrag(e, zoom, (d) => b.actions.setConfig(dragged(start, h, d), label, gesture), () => setActive(null));
  };
}

export default function SvgBuilderEdgeHandles({ b, zoom }: { b: BuilderApi; zoom: number }) {
  const [active, setActive] = useState<string | null>(null);
  const start = useEdgeDrag(b, zoom, setActive);
  const z = zoom > 0 ? zoom : 1;
  return <div className={`bld-edges${active !== null ? " is-dragging" : ""}`} aria-hidden="false">
    {edgeHandles(b.config, b.layout).map((h) => {
      const across = h.side === "left" || h.side === "right";
      const shape = across ? "v" : "h";
      return <span key={h.id} className={`bld-edge-handle is-${shape} is-${h.kind}${active === h.id ? " is-on" : ""}`} data-testid={`builder-edge-${h.id}`}
        role="separator" aria-orientation={across ? "vertical" : "horizontal"} aria-label={TITLE[h.kind]} title={TITLE[h.kind]}
        style={{ left: h.x, top: h.y, ["--edge-z" as string]: String(1 / z) }} onPointerDown={(e) => start(e, h)}>
        {active === h.id && <span className="bld-edge-badge" data-testid="builder-edge-badge">{badgeOf(b.config, h)}</span>}
      </span>;
    })}
  </div>;
}
