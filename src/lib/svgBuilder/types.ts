// types.ts — the SVG builder's public domain contracts. Pure data only: no
// React, filesystem or provider imports, so every rule can be tested alone.

export type BannerPosition = "left" | "right" | "top" | "bottom" | "none";
export type SelectionMode = "similar" | "random" | "filtered";
export type CaptionCase = "upper" | "normal";
export type TitleFace = "sans" | "serif" | "mono";
export type MetadataState = "empty" | "draft" | "invalid" | "accepted" | "edited";

export interface Rect { x: number; y: number; width: number; height: number }
/** One grid cell: `size` is the fitted icon box, `glyph` the stroke-aware drawing size inside it. */
export interface CellFrame { index: number; x: number; y: number; size: number; glyph: number; captionY: number; captionSize: number }

export interface BuilderIconAsset {
  id: string;
  base: string;
  suffix: string;
  label: string;
  category: string;
  tags: readonly string[];
  svgPath: string;
  svgName: string;
  version: number;
  fingerprint: string;
  metaPath: string;
  approved: true;
  /** From `<pair-folder>/export/export.json` when present: the label is then this title. */
  title?: string;
  description?: string;
  /** The export metadata tags, as written. Also folded into `tags` for search and scoring. */
  keywords?: readonly string[];
  /** The export metadata's one-word Icon Name (2026-11-13): what the caption under the icon shows. */
  name?: string;
  /** The pair's AI preview image, relative to the root (icon-map.json), when known. */
  aiPath?: string;
}

/** The searchable metadata block of an icon's export record. */
export interface ExportMeta { title: string; description: string; tags: readonly string[]; name?: string }

/** The approved-row fields the builder needs; structurally supplied by discovery. */
export interface BuilderRowLike {
  id: string; base: string; suffix: string; dirPath: string;
  svgPath: string; svgName: string; version: number; fingerprint: string; metaPath: string;
  /** The pair's AI preview image (the upload row's `aiPath`), when known. */
  aiPath?: string;
}

export interface BuilderProfile { id: string; label: string; tags: readonly string[] }

/** The reference "Selection recipe": mode, metadata profile, threshold (%) and the Filtered category. */
export interface SelectionRecipe {
  mode: SelectionMode;
  profileId: string;
  threshold: number;
  category: string;
  /** Similar: the "mean alike" (text vector) share in %, 0–100; the rest is "look alike" (image vector). */
  textWeight: number;
}

/** A pick that had to top up from the whole library reports how short its pool was. */
export interface SelectionShortfall { pool: number; cells: number }

export interface SelectionResult {
  ids: string[];
  shortfall: SelectionShortfall | null;
}

export interface SheetConfig {
  artboard: {
    width: number; height: number; background: string; padding: number; radius: number;
  };
  grid: {
    columns: number; rows: number; gapX: number; gapY: number; captions: boolean;
    captionColor: string; captionSize: number; captionCase: CaptionCase;
  };
  icons: {
    box: number; strokeWidth: number; color: string; linecap: "round" | "square";
  };
  banner: {
    position: BannerPosition; size: number; background: string; accent: string;
    textColor: string; subtitleColor: string; style: "solid" | "split";
    title: string; subtitle: string; titleSize: number; subtitleSize: number;
    titleFace: TitleFace; hero: boolean; heroIconId: string | null; divider: boolean;
    /** Text placement (2026-11-13): an inset from the banner edge, and per-text moves in px. */
    textPadding: number; titleDx: number; titleDy: number; subtitleDx: number; subtitleDy: number;
  };
}

export interface SheetLayout {
  content: Rect;
  banner: Rect | null;
  grid: Rect | null;
  cells: readonly CellFrame[];
  fitScale: number;
  overflow: boolean;
  capacity: number;
}

export interface SheetMetadataValidation { ok: boolean; errors: readonly string[]; warnings: readonly string[] }

export interface SheetMetadataFields {
  title: string;
  subtitle: string;
  keywords: readonly string[];
}

export interface SheetMetadata extends SheetMetadataFields {
  state: MetadataState;
  validation: SheetMetadataValidation | null;
  fingerprint: string | null;
}

export interface SourceFingerprint { id: string; fingerprint: string }

export interface SheetDocument {
  svg: string;
  placedIds: readonly string[];
  brokenIds: readonly string[];
  sourceFingerprints: readonly SourceFingerprint[];
  configFingerprint: string;
  metadata: SheetMetadata | null;
}

export interface SheetPreset {
  v: 1;
  version?: 1;
  generator?: string;
  created?: string;
  selection?: readonly string[];
  config: SheetConfig;
  placedIds: readonly string[];
  lockedIds: readonly string[];
  seed: number;
  recipe: SelectionRecipe;
  metadata: SheetMetadata | null;
  sources: readonly SourceFingerprint[];
}

export interface BuilderUndoPatch {
  config: SheetConfig;
  seed: number;
  lockedIds: readonly string[];
  recipe: SelectionRecipe;
}

export interface BuilderListView { query: string; category: string; sort: "name" | "category" }
