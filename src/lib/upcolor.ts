// upcolor.ts — colour parsing for the export pipeline (prompt §5/§13).
// Owns: normalising a colour reference and converting it to the RGB triple
// PostScript needs. Honest by design: anything that is not a literal colour
// (a paint-server url, currentColor, an unknown name) is null — never a guess
// and never a silent substitution.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** "#AbC"/"abc"/"#aabbcc" → "#aabbcc"; anything else → null. */
export function normalizeHexColor(value: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (m === null) return null;
  const hex = m[1].toLowerCase();
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return `#${full}`;
}

const NAMED: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  yellow: "#ffff00", gray: "#808080", grey: "#808080", silver: "#c0c0c0", maroon: "#800000",
  navy: "#000080", teal: "#008080", aqua: "#00ffff", cyan: "#00ffff", fuchsia: "#ff00ff",
  magenta: "#ff00ff", olive: "#808000", lime: "#00ff00", purple: "#800080", orange: "#ffa500",
  pink: "#ffc0cb", brown: "#a52a2a", gold: "#ffd700", indigo: "#4b0082", violet: "#ee82ee",
};

/** Normalises a colour reference (named colours resolve to hex); null = not a literal colour. */
export function normalizeColorRef(value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  const hex = normalizeHexColor(v);
  if (hex !== null) return hex;
  return NAMED[v.toLowerCase()] ?? null;
}

/** Converts a literal colour to the 0–1 RGB triple EPS needs; null when not literal. */
export function colorToRgb(value: string): Rgb | null {
  const ref = normalizeColorRef(value);
  if (ref !== null) return hexToRgb(ref);
  const rgb = /^rgb\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*\)$/i.exec(value.trim());
  if (rgb === null) return null;
  return { r: Number(rgb[1]) / 255, g: Number(rgb[2]) / 255, b: Number(rgb[3]) / 255 };
}

function hexToRgb(hex: string): Rgb {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}
