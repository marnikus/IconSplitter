// ui/SvgPreview.tsx — revocable local-file/SVG object URLs for row thumbnails.

import { useEffect, useMemo, useState } from "react";
import type { DirHandleLike } from "../../lib/fs";
import { resolveFile } from "../../selection/handles";

export default function SvgPreview({ root, path, svg, alt }: {
  root: { current: DirHandleLike | null }; path: string; svg: string | null; alt: string;
}) {
  const [source, setSource] = useState<{ path: string; url: string } | null>(null);
  const sourceUrl = source?.path === path ? source.url : null;
  const svgUrl = useMemo(() => svg ? URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) : null, [svg]);
  useEffect(() => sourceObjectUrl(root, path, setSource), [root, path]);
  useEffect(() => () => { if (svgUrl) URL.revokeObjectURL(svgUrl); }, [svgUrl]);
  return (
    <div className="svg-preview-pair">
      <PreviewBox url={sourceUrl} alt={`${alt} AI source`} label="AI source" />
      <PreviewBox url={svgUrl} alt={`${alt} newest SVG`} label="Newest SVG" />
    </div>
  );
}

function PreviewBox({ url, alt, label }: { url: string | null; alt: string; label: string }) {
  return (
    <div className="svg-preview-wrap">
      {url ? <img className="svg-preview-image" src={url} alt={alt} />
        : <div className="svg-preview-image svg-preview-empty" aria-label={`${label} preview unavailable`}>—</div>}
      <span className="svg-preview-tag">{label}</span>
    </div>
  );
}

function sourceObjectUrl(
  root: { current: DirHandleLike | null }, path: string,
  setSource: (source: { path: string; url: string } | null) => void,
): () => void {
  let current: string | null = null;
  let live = true;
  void resolveFileAt(root.current, path).then((url) => {
    if (!live) { if (url) URL.revokeObjectURL(url); return; }
    current = url;
    setSource(url ? { path, url } : null);
  });
  return () => { live = false; if (current) URL.revokeObjectURL(current); };
}

async function resolveFileAt(root: DirHandleLike | null, path: string): Promise<string | null> {
  if (!root) return null;
  try {
    const handle = await resolveFile(root, path);
    return handle ? URL.createObjectURL(await handle.getFile()) : null;
  } catch { return null; }
}
