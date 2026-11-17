// solidcolor.ts — the final artwork never uses transparency (2026-11-14).
// Where the reference drew a colour at some opacity over a surface, the sheet
// draws the one solid colour that results: fg mixed onto bg by alpha.

function rgbOf(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** `fg` at `alpha` (0–1) over `bg`, as an opaque #RRGGBB; `fg` unchanged when either is not a hex colour. */
export function solidMix(fg: string, bg: string, alpha: number): string {
  const a = rgbOf(fg), b = rgbOf(bg);
  if (a === null || b === null) return fg;
  const t = Math.max(0, Math.min(1, alpha));
  return `#${a.map((v, i) => Math.round(v * t + b[i] * (1 - t)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
