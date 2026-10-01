// Thumb.tsx — a thumbnail that never breaks its row (spec §10): a placeholder
// while loading and an honest "Preview unavailable" when the read failed.

import { useEffect } from "react";
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
      title={failed ? "Preview unavailable" : "Loading preview…"}
      className={`${className} grid shrink-0 place-items-center rounded-md bg-white/10 text-xs text-slate-300`}
    >
      {failed ? "⚠" : ""}
    </div>
  );
}
