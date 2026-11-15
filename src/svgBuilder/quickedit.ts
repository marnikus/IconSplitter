// quickedit.ts — what the pointer is over on the artboard, for the quick editor
// (2026-11-14), and what each kind of element lets the user change. The sheet
// lives in a shadow root, so the native event path is read (like the in-place
// text editor). Element marks come from compose/banner/svgAsset.
import type { NumRange } from "../lib/svgBuilder/ranges";
import { RANGES } from "../lib/svgBuilder/ranges";
import type { SheetConfig } from "../lib/svgBuilder/types";

export type QuickKind = "icon" | "hero" | "title" | "subtitle" | "caption" | "block" | "banner" | "canvas";

export interface QuickTarget { kind: QuickKind; el: Element }

/** Plain marks, in priority order (after the cell and banner-text checks). */
const MARKS: readonly [string, QuickKind][] = [
  ["data-caption", "caption"], ["data-split-block", "block"], ["data-banner", "banner"], ["data-artboard", "canvas"],
];

/** The innermost marked element on the path decides; the hero's own icon belongs to the hero. */
function kindOf(el: Element): QuickKind | null {
  if (el.classList.contains("bld-cell")) return "icon";
  const text = el.getAttribute("data-banner-text");
  if (text === "title" || text === "subtitle") return text;
  if (el.hasAttribute("data-banner-hero")) return "hero";
  const cell = el.getAttribute("data-cell-index");
  if (cell !== null && cell !== "-1") return "icon";
  return MARKS.find(([attr]) => el.hasAttribute(attr))?.[1] ?? null;
}

export function quickTargetOf(path: readonly EventTarget[]): QuickTarget | null {
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (node.closest?.(".bld-inline-text, .bld-quick") ?? false) return null; // our own editors
    const kind = kindOf(node);
    if (kind !== null) return { kind, el: node };
  }
  return null;
}

type Group = keyof SheetConfig;
export interface ColorSlot { label: string; group: Group; key: string }
export interface SizeSlot { label: string; group: Group; key: string; range: NumRange; unit: string }

/** What each element offers: one colour, and maybe a stroke or text size (+ font for the title). */
/** `gap`: a second slider in the text panel (captions: the icon–caption gap). */
/** `textCase`: which banner case field the text panel switches (2026-11-15). */
export interface QuickSpec { name: string; color: ColorSlot; stroke?: SizeSlot; text?: SizeSlot; face?: boolean; gap?: SizeSlot; textCase?: "titleCase" | "subtitleCase" }

export const QUICK_SPECS: Readonly<Record<QuickKind, QuickSpec>> = {
  icon: {
    name: "Outlined icon", color: { label: "Icon color", group: "icons", key: "color" },
    stroke: { label: "Stroke width", group: "icons", key: "strokeWidth", range: RANGES.strokeWidth, unit: "px" },
  },
  hero: {
    name: "Banner icon", color: { label: "Accent color (icon and circle)", group: "banner", key: "accent" },
    stroke: { label: "Icon stroke", group: "banner", key: "heroStroke", range: RANGES.heroStroke, unit: "px" },
  },
  caption: {
    name: "Caption", color: { label: "Caption color", group: "grid", key: "captionColor" },
    text: { label: "Caption size", group: "grid", key: "captionSize", range: RANGES.captionSize, unit: "px" },
    gap: { label: "Gap to icon", group: "grid", key: "captionGap", range: RANGES.captionGap, unit: "px" },
  },
  title: {
    name: "Title", color: { label: "Title color", group: "banner", key: "textColor" },
    text: { label: "Title size", group: "banner", key: "titleSize", range: RANGES.titleSize, unit: "px" }, face: true, textCase: "titleCase",
  },
  subtitle: {
    name: "Subtitle", color: { label: "Subtitle color", group: "banner", key: "subtitleColor" },
    text: { label: "Subtitle size", group: "banner", key: "subtitleSize", range: RANGES.subtitleSize, unit: "px" }, textCase: "subtitleCase",
  },
  block: { name: "Banner block", color: { label: "Block color", group: "banner", key: "accent" } },
  banner: { name: "Banner", color: { label: "Banner background", group: "banner", key: "background" } },
  canvas: { name: "Background", color: { label: "Background color", group: "artboard", key: "background" } },
};

/** One value of the config by slot. */
export function slotValue(config: SheetConfig, slot: { group: Group; key: string }): unknown {
  return (config[slot.group] as unknown as Record<string, unknown>)[slot.key];
}

/** The config with one slot changed. */
export function withSlot(config: SheetConfig, slot: { group: Group; key: string }, value: unknown): SheetConfig {
  return { ...config, [slot.group]: { ...config[slot.group], [slot.key]: value } };
}
