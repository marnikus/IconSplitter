// SvgBuilderSizeHandles.tsx — artboard width / height grips just OUTSIDE the
// artboard (2026-11-14): right of its right edge (width), below its bottom edge
// (height), and off its bottom-right corner (both). Drawn on the unscaled wrap
// in screen pixels (the artboard itself clips its overflow). One undo step per
// drag, "W × H" badge.
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { artboardSizeAfter } from "../lib/svgBuilder/edgedrag";
import { dragGesture, trackDrag } from "./trackdrag";
import type { BuilderApi } from "./useSvgBuilder";

type Grip = "right" | "bottom" | "corner";
const OUT = 12; // screen px outside the artboard edge
const TITLE: Record<Grip, string> = { right: "Drag: artboard width", bottom: "Drag: artboard height", corner: "Drag: artboard width and height" };

function placeOf(grip: Grip, w: number, h: number): { left: number; top: number } {
  if (grip === "right") return { left: w + OUT, top: h / 2 };
  if (grip === "bottom") return { left: w / 2, top: h + OUT };
  return { left: w + OUT, top: h + OUT };
}

export default function SvgBuilderSizeHandles({ b, zoom }: { b: BuilderApi; zoom: number }) {
  const [active, setActive] = useState<Grip | null>(null);
  const { width, height } = b.config.artboard;
  const start = (e: ReactPointerEvent, grip: Grip) => {
    const from = b.config;
    const gesture = dragGesture(`size-${grip}`);
    setActive(grip);
    trackDrag(e, zoom, (d) => b.actions.setConfig({ ...from, artboard: { ...from.artboard, ...artboardSizeAfter(from.artboard, grip, d) } },
      "Artboard size", gesture), () => setActive(null));
  };
  return <div className={`bld-size-grips${active !== null ? " is-dragging" : ""}`}>
    {(["right", "bottom", "corner"] as const).map((grip) => <span key={grip} data-testid={`builder-edge-size-${grip}`}
      className={`bld-size-grip is-${grip}${active === grip ? " is-on" : ""}`} role="separator" aria-label={TITLE[grip]} title={TITLE[grip]}
      style={placeOf(grip, width * zoom, height * zoom)} onPointerDown={(e) => start(e, grip)}>
      {active === grip && <span className="bld-edge-badge" data-testid="builder-edge-badge">{width} × {height}</span>}
    </span>)}
  </div>;
}
