// Glyph.tsx — the small inline icon set shared by the review UI (status badges,
// panes, status bar). One owner for path data keeps every icon consistent.

export type GlyphName = "pending" | "approved" | "declined" | "warning" | "sync" | "image" | "zoom" | "search" | "pause" | "play";

const GLYPHS: Record<GlyphName, string> = {
  pending: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  approved: "m5 13 4 4L19 7",
  declined: "M6 6l12 12M18 6 6 18",
  warning: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  sync: "M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2M3 18v-6h6M21 6v6h-6",
  image: "M3 5h18v14H3zM3 15l4-4 5 5 3-3 6 6",
  zoom: "M11 19a8 8 0 1 1 16 0 8 8 0 0 1-16 0ZM21 21l4 4",
  search: "M11 19a8 8 0 1 1 16 0 8 8 0 0 1-16 0ZM21 21l4 4",
  pause: "M9 5v14M15 5v14",
  play: "M7 4l12 8-12 8V4Z",
};

export default function Glyph({ name, className = "h-3.5 w-3.5" }: { name: GlyphName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={GLYPHS[name]} />
    </svg>
  );
}
