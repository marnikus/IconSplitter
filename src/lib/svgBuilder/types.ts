// types.ts — the SVG builder's public domain contracts. Pure data only: no
// React, filesystem or provider imports, so every rule can be tested alone.

export type BannerPosition = "left" | "right" | "top" | "bottom" | "none";
export type SelectionMode = "similar" | "random" | "filtered";
export type CaptionCase = "upper" | "normal";
export type TitleFace = "sans" | "serif" | "mono";
export type MetadataState = "empty" | "draft" | "invalid" | "accepted" | "edited";

export interface Rect { x: number; y: number; width: number; height: number }
export interface CellFrame { index: number; x: number; y: number; size: number; captionY: number }

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
}

/** The approved-row fields the builder needs; structurally supplied by discovery. */
export interface BuilderRowLike {
  id: string; base: string; suffix: string; dirPath: string;
  svgPath: string; svgName: string; version: number; fingerprint: string; metaPath: string;
}

export interface BuilderProfile { id: string; label: string; tags: readonly string[] }

export interface SelectionRecipe {
  mode: SelectionMode;
  profileId: string;
  threshold: number;
  category: string;
  count: number;
  seed: number;
  lockedIds: readonly string[];
  fillFromFullLibrary: boolean;
  query?: string;
}

export interface SelectionResult {
  ids: string[];
  notices: string[];
  poolSize: number;
  usedFallback: boolean;
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
