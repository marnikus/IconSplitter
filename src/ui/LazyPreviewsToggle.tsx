// LazyPreviewsToggle.tsx — the top bar's global "Lazy previews" checkbox
// (2026-11-06): on, list rows load their image/SVG preview only near the
// visible area (ui/LazyPreview); off, every row loads it at once.

import { setLazyPreviews, useLazyPreviews } from "./lazypreviews";

export default function LazyPreviewsToggle() {
  const on = useLazyPreviews();
  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-300" style={{ cursor: "pointer" }}
      title="Load row previews (images and SVGs) only near the visible part of each list: the first 20 rows at once, then 15 rows ahead while you scroll. Off: every row loads its preview at once.">
      <input type="checkbox" data-testid="lazy-previews-toggle" checked={on} onChange={(e) => setLazyPreviews(e.target.checked)} />
      Lazy previews
    </label>
  );
}
