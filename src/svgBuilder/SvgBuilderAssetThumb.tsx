// SvgBuilderAssetThumb.tsx — one approved SVG preview inside a shadow root, so
// a source document cannot style the app or fetch the network.
import { useEffect, useRef } from "react";
import { PREVIEW_CSS } from "../lib/svgpreview";
import type { BuilderIconAsset } from "../lib/svgBuilder/types";
import type { AssetRepository } from "./repository";

export default function SvgBuilderAssetThumb({ asset, repository }: {
  asset: BuilderIconAsset; repository: AssetRepository | null;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let alive = true;
    const node = host.current;
    if (node === null || repository === null) return;
    void repository.render(asset.id).then((render) => {
      if (!alive || !render.ok) return;
      const root = node.shadowRoot ?? node.attachShadow({ mode: "open" });
      root.innerHTML = `${PREVIEW_CSS}${render.html}`;
    });
    return () => { alive = false; };
  }, [asset.id, repository]);
  return <div className="builder-thumb" data-testid={`builder-prev-${asset.id}`} ref={host}
    aria-label={`${asset.label} approved SVG preview`}>{asset.label.slice(0, 1)}</div>;
}
