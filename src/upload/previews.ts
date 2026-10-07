// previews.ts — the preview swatches (prompt §6). Owns ONE thing: the set of
// backgrounds the preview can be judged against. It is display-only by design —
// changing the swatch never changes an export, which is why no setting reads it.

export interface PreviewBackground {
  label: string;
  value: string;
}

export const PREVIEW_BACKGROUNDS: readonly PreviewBackground[] = [
  { label: "White", value: "#ffffff" },
  { label: "Black", value: "#080808" },
  { label: "Gray", value: "#808080" },
  { label: "Green", value: "#43b472" },
  { label: "Red", value: "#cc5360" },
];
