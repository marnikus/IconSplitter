// Thumb.tsx — a thumbnail that never breaks its row (spec §10): a dashed
// placeholder while loading and an honest "Thumbnail failed" tooltip when the
// read failed (the row badges it, so the state is visible and not just colour).

import { useEffect } from "react";
import Glyph from "./Glyph";
import type { Thumbs } from "./useThumbnails";

export interface ThumbProps {
  relPath: string;
  thumbs: Thumbs;
  className?: string;
}

export default function Thumb({ relPath, thumbs, className = "h-10 w-10" }: ThumbProps) {
  const url = thumbs.urlFor(relPath);
  const failed = thumbs.errorFor(relPath);
  useEffect(() => { thumbs.request(relPath); }, [relPath, thumbs]);
  if (url) return <img src={url} alt="" className={`${className} shrink-0 rounded-md bg-white/5 object-contain`} />;
  return (
    <div
      data-testid="thumb-placeholder"
      title={failed ? "Thumbnail failed" : "Loading preview…"}
      className={`${className} grid shrink-0 place-items-center rounded-md border border-dashed bg-white/[0.03] text-slate-500 ${
        failed ? "border-amber-400/60 text-amber-300" : "border-white/15"
      }`}
    >
      <Glyph name={failed ? "warning" : "image"} className="h-4 w-4" />
    </div>
  );
}
