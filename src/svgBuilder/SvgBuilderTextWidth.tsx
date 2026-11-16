// SvgBuilderTextWidth.tsx — the banner title / subtitle box width, dragged on the
// artboard (2026-11-14): a grip at the hovered text's right edge, like the
// artboard size grips. Dragging sets banner.titleWidth / subtitleWidth (text
// wraps at that width; centred text grows on both sides, so the drag counts
// twice); one undo step per drag, live badge.
import { useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { RANGES, clampTo } from "../lib/svgBuilder/ranges";
import { hoverRectOf } from "./quickplace";
import { dragGesture, trackDrag } from "./trackdrag";
import type { BuilderApi } from "./useSvgBuilder";

type Which = "title" | "subtitle";
interface Props { b: BuilderApi; which: Which; el: Element; board: RefObject<HTMLDivElement | null>; wrap: RefObject<HTMLDivElement | null>; onDrag: (on: boolean) => void; onEnter: () => void }

const KEY = { title: "titleWidth", subtitle: "subtitleWidth" } as const;

export default function SvgBuilderTextWidth({ b, which, el, board, wrap, onDrag, onEnter }: Props) {
  const [active, setActive] = useState(false);
  const node = wrap.current;
  const rect = node === null ? null : hoverRectOf({ kind: which, el }, b, { board: board.current, wrap: node });
  if (node === null || rect === null) return null;
  const zoom = node.getBoundingClientRect().width / b.config.artboard.width || 1;
  const width = b.config.banner[KEY[which]];
  const start = (e: ReactPointerEvent) => {
    const from = b.config;
    const base = from.banner[KEY[which]] > 0 ? from.banner[KEY[which]] : rect.width / zoom;
    const twice = from.banner.position === "left" || from.banner.position === "right" ? 2 : 1;
    const gesture = dragGesture(`text-width-${which}`);
    setActive(true); onDrag(true);
    trackDrag(e, zoom, (d) => {
      const next = Math.round(Math.max(40, clampTo(RANGES.textWidth, base + d.dx * twice)));
      b.actions.setConfig({ ...from, banner: { ...from.banner, [KEY[which]]: next } }, which === "title" ? "Title width" : "Subtitle width", gesture);
    }, () => { setActive(false); onDrag(false); });
  };
  return <span className={`bld-text-width${active ? " is-on" : ""}`} data-testid={`builder-text-width-${which}`} role="separator" aria-orientation="vertical"
    title={`Drag: ${which} box width${width > 0 ? ` (${width} px)` : " (automatic)"}`} aria-label={`Drag to set the ${which} width`}
    style={{ left: rect.x + rect.width + 6, top: rect.y + rect.height / 2 }} onPointerDown={start} onMouseEnter={onEnter} onMouseMove={onEnter}>
    {active && <span className="bld-edge-badge" data-testid="builder-text-width-badge">{width} px</span>}
  </span>;
}
