/** SVG response handling kept pure so provider and filesystem adapters can be tested independently. */
export interface SvgCheck { ok: boolean; svg: string; errors: string[]; iconCount: number }

export function extractSvg(raw: string): string | null {
  const block = raw.match(/```(?:svg|xml)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = block.indexOf("<svg");
  const end = block.lastIndexOf("</svg>");
  return start >= 0 && end > start ? block.slice(start, end + 6).trim() : null;
}

export function validateSvg(raw: string): SvgCheck {
  const svg = extractSvg(raw);
  if (!svg) return { ok: false, svg: "", errors: ["No complete SVG document was returned."], iconCount: 0 };
  const errors: string[] = [];
  if (!/^<svg\b[^>]*>/i.test(svg) || !/<\/svg>$/i.test(svg)) errors.push("SVG root is incomplete.");
  if (!/(viewBox\s*=|(?:width|height)\s*=)/i.test(svg)) errors.push("SVG needs a viewBox or dimensions.");
  if (/<script\b|\son\w+\s*=|(?:href|src)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i.test(svg)) errors.push("Unsafe script, event handler, or external resource.");
  if (!/(<path\b|<(?:rect|circle|ellipse|polygon|g)\b)/i.test(svg)) errors.push("SVG has no renderable geometry.");
  const iconCount = (svg.match(/<g\b/gi) ?? []).length || (svg.match(/<svg\b/gi) ?? []).length;
  return { ok: errors.length === 0, svg, errors, iconCount };
}

export function nextSvgVersion(names: string[], base: string): number {
  const rx = new RegExp(`^${escapeRegex(base)}(?:_v(\\d+))?\\.svg$`, "i");
  const versions = names.flatMap((name) => { const n = name.match(rx)?.[1]; return [n ? Number(n) : 1]; });
  return versions.length ? Math.max(...versions) + 1 : 1;
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
