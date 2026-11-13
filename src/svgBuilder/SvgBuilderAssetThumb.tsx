// SvgBuilderAssetThumb.tsx — one library tile preview, drawn STROKE-ONLY with
// the same sanitiser/recolour the artboard uses (FIXES E1), inside a shadow root
// so a source document can never style the app. Loads when scrolled into view.
import { useEffect, useRef, useState } from "react";
import { iconPreviewSvg } from "../lib/svgBuilder/svgAsset";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";
import type { AssetRepository } from "./repository";

const TILE_STYLE = { box: 24, strokeWidth: 1.55, color: "#C6CEE2", linecap: "round" as const };

export default function SvgBuilderAssetThumb({ asset, repository }: { asset: BuilderIconAsset; repository: AssetRepository | null }) {
  const host = useRef<HTMLSpanElement | null>(null);
  const visible = useInView(host);
  useEffect(() => {
    const node = host.current;
    if (node === null || repository === null || !visible) return;
    let alive = true;
    void repository.readSvg(asset.id).then((code) => {
      const svg = alive && code !== null ? iconPreviewSvg(code, asset, TILE_STYLE) : null;
      if (svg === null) return;
      const root = node.shadowRoot ?? node.attachShadow({ mode: "open" });
      root.innerHTML = `<style>:host{display:block;width:100%;height:100%}svg{display:block}</style>${svg}`;
    });
    return () => { alive = false; };
  }, [asset, repository, visible]);
  return <span className="bld-thumb" data-testid={`builder-prev-${asset.id}`} ref={host} aria-label={`${asset.label} preview`} />;
}

/** True once the element has been near the viewport (always true without IntersectionObserver). */
function useInView(ref: { current: Element | null }): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (seen || ref.current === null) return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setSeen(true); }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}
