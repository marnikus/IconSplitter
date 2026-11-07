// SvgBuilderArtboard.tsx — the live sheet preview. The composed SVG is already
// validated and contains only sanitised approved asset groups.
import { useEffect, useRef } from "react";
import type { SheetConfig, SheetDocument } from "../lib/svgBuilder/types";

export default function SvgBuilderArtboard({ doc, config, zoom }: {
  doc: SheetDocument; config: SheetConfig; zoom: number;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = host.current;
    if (node === null) return;
    const root = node.shadowRoot ?? node.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block}svg{display:block;width:100%;height:auto}</style>${doc.svg}`;
  }, [doc.svg]);
  return <div className="builder-artboard" data-testid="builder-artboard" ref={host}
    style={{ width: config.artboard.width, height: config.artboard.height, transform: `scale(${zoom})` }}
    data-zoom={zoom} aria-label="Editable SVG sheet artboard" />;
}
