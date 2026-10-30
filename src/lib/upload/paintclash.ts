// paintclash.ts — a stroke colour the export background hides (2026-10-19
// report: a black background with the black stroke colour previewed, and
// exported, a solid black square). Only two KNOWN colours can clash: "default"
// / "transparent" backgrounds and the artwork's own stroke paint say nothing.
// The rule is WCAG's non-text contrast (lib/svgbackground CONTRAST_MIN).

import { CONTRAST_MIN, normalizeHex, relativeLuminance } from "../svgbackground";
import type { UploadSettings } from "./settings";

/** One sentence when the strokes would be (nearly) invisible on the artboard; null when readable or unknown. */
export function paintClash(s: Pick<UploadSettings, "background" | "strokeColor">): string | null {
  const bg = normalizeHex(s.background);
  const ink = normalizeHex(s.strokeColor);
  if (bg === null || ink === null || contrast(bg, ink) >= CONTRAST_MIN) return null;
  return `${ink} strokes on a ${bg} background — the exported icon will be invisible; change the background or the stroke colour`;
}

/** WCAG contrast ratio of two colours, 1 .. 21. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
