// quickedit.ts — what the pointer is over on the artboard, for the quick editor
// (2026-11-14), and what each kind of element lets the user change. The sheet
// lives in a shadow root, so the native event path is read (like the in-place
// text editor). Element marks come from compose/banner/svgAsset.
import type { NumRange } from "../lib/svgBuilder/ranges";
import { RANGES } from "../lib/svgBuilder/ranges";
import type { SheetConfig } from "../lib/svgBuilder/types";

export type QuickKind = "icon" | "hero" | "title" | "subtitle" | "block" | "banner" | "canvas";

export interface QuickTarget { kind: QuickKind; el: Element }

/** The innermost marked element on the path decides; the hero's own icon belongs to the hero. */
function kindOf(el: Element): QuickKind | null {
  if (el.classList.contains("bld-cell")) return "icon";
  const text = el.getAttribute("data-banner-text");
  if (text === "title" || text === "subtitle") return text;
  if (el.hasAttribute("data-banner-hero")) return "hero";
  if (el.hasAttribute("data-cell-index") && el.getAttribute("data-cell-index") !== "-1") return "icon";
  if (el.hasAttribute("data-split-block")) return "block";
  if (el.hasAttribute("data-banner")) return "banner";
  if (el.hasAttribute("data-artboard")) return "canvas";
  return null;
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
export interface QuickSpec { name: string; color: ColorSlot; stroke?: SizeSlot; text?: SizeSlot; face?: boolean }

export const QUICK_SPECS: Readonly<Record<QuickKind, QuickSpec>> = {
  icon: {
    name: "Outlined icon", color: { label: "Icon color", group: "icons", key: "color" },
    stroke: { label: "Stroke width", group: "icons", key: "strokeWidth", range: RANGES.strokeWidth, unit: "px" },
  },
  hero: {
    name: "Banner icon", color: { label: "Accent color (icon and circle)", group: "banner", key: "accent" },
    stroke: { label: "Icon stroke", group: "banner", key: "heroStroke", range: RANGES.heroStroke, unit: "px" },
  },
  title: {
    name: "Title", color: { label: "Title color", group: "banner", key: "textColor" },
    text: { label: "Title size", group: "banner", key: "titleSize", range: RANGES.titleSize, unit: "px" }, face: true,
  },
  subtitle: {
    name: "Subtitle", color: { label: "Subtitle color", group: "banner", key: "subtitleColor" },
    text: { label: "Subtitle size", group: "banner", key: "subtitleSize", range: RANGES.subtitleSize, unit: "px" },
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
