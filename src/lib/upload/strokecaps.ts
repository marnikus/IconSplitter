// Export-wide endpoint policy. "source" preserves mixed/inherited SVG caps.
import { stripStyleKeys } from "./geom/stroke";

export type StrokeLinecap = "source" | "butt" | "round";

export function parseStrokeLinecap(value: unknown): StrokeLinecap | null {
  return value === "source" || value === "butt" || value === "round" ? value : null;
}

export function normalizeStrokeLinecap(value: unknown): StrokeLinecap {
  return parseStrokeLinecap(value) ?? "source";
}

/** Invalid stored pins disappear instead of pinning a fallback. */
export function readStrokeCapOverride(raw: Record<string, unknown>): { strokeLinecap?: StrokeLinecap } {
  const cap = parseStrokeLinecap(raw.strokeLinecap);
  return cap === null ? {} : { strokeLinecap: cap };
}

/** Write only on a known stroked shape; inline style must not defeat the choice. */
export function setStrokeCap(el: Element, cap: Exclude<StrokeLinecap, "source">): void {
  stripStyleKeys(el, ["stroke-linecap"]);
  el.setAttribute("stroke-linecap", cap);
}
