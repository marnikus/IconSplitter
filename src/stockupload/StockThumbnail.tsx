import { useEffect, useState } from "react";
import type { StockPackage } from "../lib/stockupload/types";
export default function StockThumbnail({ row, zoom }: { row: StockPackage; zoom: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let disposed = false, current = "";
    const artifact = row.artifacts.find(a => a.kind === "jpg" || a.kind === "png" || a.kind === "svg");
    void artifact?.handle?.getFile().then(file => { if (!disposed) { current = URL.createObjectURL(file); setUrl(current); } });
    return () => { disposed = true; if (current) URL.revokeObjectURL(current); };
  }, [row]);
  return <div className="svg-preview-frame" style={{ width: zoom, height: zoom }}>{url ? <img className="svg-thumb" style={{ width: zoom, height: zoom, objectFit: "contain" }} src={url} alt={row.name} loading="lazy" /> : <span>Export</span>}</div>;
}
