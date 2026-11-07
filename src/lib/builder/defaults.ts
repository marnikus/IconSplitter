// defaults.ts — the sheet a freshly opened builder shows (design §4.1). Every
// field is in range for lib/builder/layout, so a default sheet always fits at
// scale 1 and never draws the overflow warning on purpose: a warning the user
// cannot cause is noise, and a warning they CAN cause must mean something.
//
// P3 will let every one of these be edited and persisted; until then they are the
// one design the artboard draws, and the ranges here are the ranges the controls
// will clamp to.

import type { LayoutConfig } from "./layout";

/** The persisted sheet design. P3 adds the controls; the shape is already final. */
export interface BuilderConfig extends LayoutConfig {
  v: 1;
  artboard: LayoutConfig["artboard"] & { background: string };
  grid: LayoutConfig["grid"] & { captionColor: string; captionCase: "upper" | "normal" };
  icons: LayoutConfig["icons"] & { strokeWidth: number; scaleStroke: boolean; color: string };
  banner: LayoutConfig["banner"] & {
    style: "solid" | "split";
    background: string;
    accent: string;
    textColor: string;
    subtitleColor: string;
    title: string;
    subtitle: string;
    titleSize: number;
    subtitleSize: number;
    titleFace: "sans" | "serif" | "mono";
    hero: boolean;
    heroIconId: string;
    divider: boolean;
  };
  export: { pngScale: 1 | 2 | 3; background: "sheet" | "transparent" };
}

/** 4 × 3 on a 1000 × 800 sheet: twelve cells, comfortably inside the padding. */
export const DEFAULT_BUILDER_CONFIG: BuilderConfig = {
  v: 1,
  artboard: { width: 1000, height: 800, background: "#f6f4ee", padding: 40, radius: 0 },
  grid: {
    columns: 4, rows: 3, gapX: 20, gapY: 20,
    captions: true, captionColor: "#2b2b2b", captionSize: 12, captionCase: "normal",
  },
  icons: { box: 120, strokeWidth: 0, scaleStroke: false, color: "#1b1b1b" },
  banner: {
    position: "none", style: "solid", size: 200,
    background: "#111827", accent: "#8b5cf6", textColor: "#f8fafc", subtitleColor: "#94a3b8",
    title: "", subtitle: "", titleSize: 28, subtitleSize: 13,
    titleFace: "sans", hero: false, heroIconId: "", divider: false,
  },
  export: { pngScale: 2, background: "sheet" },
};

/** The dense grid the overflow test drives: 16 × 16 cannot fit a 1000 × 800 sheet. */
export const DENSE_BUILDER_CONFIG: BuilderConfig = {
  ...DEFAULT_BUILDER_CONFIG,
  grid: { ...DEFAULT_BUILDER_CONFIG.grid, columns: 16, rows: 16 },
};

/** A copy with one grid dimension replaced — the control surface P3 will edit. */
export function withGrid(c: BuilderConfig, patch: Partial<BuilderConfig["grid"]>): BuilderConfig {
  return { ...c, grid: { ...c.grid, ...patch } };
}
