// SvgBuilderEdgeHandles.tsx — grips on the artboard (2026-11-14): the banner's
// inner edge resizes the banner, the icon area's padding edges change the
// padding, the artboard's right / bottom border and corner change its size. Preview-only overlay in artboard pixels (the board is scaled by
// `zoom`); each drag is one coalesced undo step, with a live value badge.
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { artboardSizeAfter, bannerSizeAfter, edgeHandles, paddingAfter, type EdgeHandle } from "../lib/svgBuilder/edgedrag";
import type { SheetConfig } from "../lib/svgBuilder/types";
import type { BuilderApi } from "./useSvgBuilder";

/** The sheet after a drag of (dx, dy) artboard pixels from the start config. */
function dragged(start: SheetConfig, h: EdgeHandle, d: { dx: number; dy: number }): SheetConfig {
  if (h.kind === "banner") return { ...start, banner: { ...start.banner, size: bannerSizeAfter(start, start.banner.size, d) } };
  if (h.kind === "size" || h.side === "corner") return { ...start, artboard: { ...start.artboard, ...artboardSizeAfter(start.artboard, h.side, d) } };
  return { ...start, artboard: { ...start.artboard, padding: paddingAfter(h.side, start.artboard.padding, d) } };
}

const LABEL: Record<EdgeHandle["kind"], (side: string) => string> = {
  banner: () => "Banner size", pad: (side) => `Padding (${side} edge)`, size: () => "Artboard size",
};
const TITLE: Record<EdgeHandle["kind"], string> = {
  banner: "Drag: banner size", pad: "Drag: padding around the icons", size: "Drag: artboard width / height",
};

/** The live badge while dragging. */
function badgeOf(c: SheetConfig, h: EdgeHandle): string {
  if (h.kind === "banner") return `${c.banner.size} px`;
  if (h.kind === "pad") return `Pad ${c.artboard.padding} px`;
  return `${c.artboard.width} × ${c.artboard.height}`;
}

function useEdgeDrag(b: BuilderApi, zoom: number, setActive: (id: string | null) => void) {
  return (e: ReactPointerEvent, h: EdgeHandle) => {
    e.preventDefault();
    e.stopPropagation();
    const start = b.config;
    const from = { x: e.clientX, y: e.clientY };
    const label = LABEL[h.kind](h.side);
    const gesture = `edge-${h.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; // this drag = one undo step
    setActive(h.id);
    const onMove = (ev: PointerEvent) => {
      const d = { dx: (ev.clientX - from.x) / zoom, dy: (ev.clientY - from.y) / zoom };
      b.actions.setConfig(dragged(start, h, d), label, gesture);
    };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); setActive(null); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
}

export default function SvgBuilderEdgeHandles({ b, zoom }: { b: BuilderApi; zoom: number }) {
  const [active, setActive] = useState<string | null>(null);
  const start = useEdgeDrag(b, zoom, setActive);
  const z = zoom > 0 ? zoom : 1;
  return <div className={`bld-edges${active !== null ? " is-dragging" : ""}`} aria-hidden="false">
    {edgeHandles(b.config, b.layout).map((h) => {
      const across = h.side === "left" || h.side === "right";
      const shape = h.side === "corner" ? "c" : across ? "v" : "h";
      return <span key={h.id} className={`bld-edge-handle is-${shape} is-${h.kind}${active === h.id ? " is-on" : ""}`} data-testid={`builder-edge-${h.id}`}
        role="separator" aria-orientation={across ? "vertical" : "horizontal"} aria-label={TITLE[h.kind]} title={TITLE[h.kind]}
        style={{ left: h.x, top: h.y, ["--edge-z" as string]: String(1 / z) }} onPointerDown={(e) => start(e, h)}>
        {active === h.id && <span className="bld-edge-badge" data-testid="builder-edge-badge">{badgeOf(b.config, h)}</span>}
      </span>;
    })}
  </div>;
}
