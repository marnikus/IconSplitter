// StockUploadPreview.tsx — zoomed row preview resolving available exported
// representation: JPEG/PNG (revoked blob URL) -> SVG -> EPS placeholder.

import { useEffect, useMemo, useState } from "react";
import { readBytesAt, type DirHandleLike } from "../lib/fs";
import type { ExportedItem } from "../lib/stockupload/types";
import { previewFrame, type PreviewBackground } from "../lib/svgbackground";
import { buildSvgPreview } from "../lib/svgpreview";
import { zoomBoxFit } from "../lib/zoom";
import SvgPreviewBox from "../svg/SvgPreview";
import { useSvgText } from "../svg/usesvgtext";

export interface StockUploadPreviewProps {
  rootRef: { current: DirHandleLike | null };
  rootToken: number;
  item: ExportedItem;
  thumb: number;
  bg: PreviewBackground;
}

function useRasterBlobUrl(
  rootRef: { current: DirHandleLike | null },
  rootToken: number,
  relPath: string | null,
  ext: "jpg" | "png" | null,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !relPath || !ext || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    void readBytesAt(root, relPath).then((bytes) => {
      if (!alive || !bytes) return;
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rootRef, rootToken, relPath, ext]);
  return url;
}

function svgRatioOf(svg: string | null): number {
  const art = svg === null ? null : buildSvgPreview(svg);
  return art !== null && art.ok ? art.ratio : 1;
}

function rasterExtOf(item: ExportedItem): "jpg" | "png" | null {
  const ext = item.files.raster?.ext;
  if (ext === "png") return "png";
  return ext === "jpg" ? "jpg" : null;
}

function PreviewInner(p: {
  item: ExportedItem;
  rasterUrl: string | null;
  svgCode: string | null;
  box: { width: number; height: number };
  testid: string;
}) {
  if (p.item.files.raster !== null && p.rasterUrl !== null) {
    return (
      <img src={p.rasterUrl} alt={p.item.stem} data-testid={p.testid}
        style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
    );
  }
  if (p.item.files.svg !== null) {
    return <SvgPreviewBox code={p.svgCode} box={p.box} testid={p.testid} label={p.item.stem} version={1} />;
  }
  return <span className="svg-badge" data-testid={p.testid}>EPS</span>;
}

export default function StockUploadPreview({ rootRef, rootToken, item, thumb, bg }: StockUploadPreviewProps) {
  const raster = item.files.raster;
  const rasterUrl = useRasterBlobUrl(rootRef, rootToken, raster?.relPath ?? null, rasterExtOf(item));
  const svgPath = raster === null && item.files.svg !== null ? item.files.svg.relPath : "";
  const svgCode = useSvgText(rootRef, rootToken, svgPath);
  const ratio = useMemo(() => (raster ? 1 : svgRatioOf(svgCode)), [raster, svgCode]);
  const box = useMemo(() => zoomBoxFit(thumb, ratio), [thumb, ratio]);
  const frame = previewFrame(bg);
  const testid = `stock-prev-${item.id}`;

  return (
    <div className={`svg-preview-frame${frame.outline ? " contrast" : ""}`} data-testid={`${testid}-frame`}
      style={{ width: box.width, height: box.height, background: frame.color }}>
      <PreviewInner item={item} rasterUrl={rasterUrl} svgCode={svgCode} box={box} testid={testid} />
    </div>
  );
}
