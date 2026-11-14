// swatches.ts — "smart" colour suggestions for the artboard's quick colour editor
// (2026-11-14): colours close to the current one — a lighter and a darker tone,
// a muted and a richer one, and its two neighbouring hues — so a small change is
// one click. Pure HSL arithmetic; always six distinct #rrggbb values.

const HEX = /^#([0-9a-f]{6})$/i;

interface Hsl { h: number; s: number; l: number }

function toHsl(hex: string): Hsl {
  const n = parseInt(HEX.exec(hex)?.[1] ?? "777777", 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function toHex({ h, s, l }: Hsl): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${[f(0), f(8), f(4)].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

const clamp = (v: number, lo = 0.06, hi = 0.94) => Math.min(hi, Math.max(lo, v));

/** Six colours near `hex`: lighter, darker, muted, richer, and the hue either side. */
export function smartSwatches(hex: string): string[] {
  const c = toHsl(HEX.test(hex) ? hex : "#777777");
  const grey = c.s < 0.08;
  const candidates: Hsl[] = [
    { ...c, l: clamp(c.l + 0.16) }, { ...c, l: clamp(c.l - 0.16) },
    { ...c, l: clamp(c.l + 0.32) }, { ...c, l: clamp(c.l - 0.32) },
    grey ? { h: 220, s: 0.35, l: c.l } : { ...c, s: clamp(c.s * 0.45, 0, 1) },
    grey ? { h: 30, s: 0.35, l: c.l } : { ...c, s: clamp(c.s + 0.25, 0, 1) },
    { ...c, h: (c.h + 28) % 360 }, { ...c, h: (c.h + 332) % 360 },
  ];
  const self = toHex(c);
  const out: string[] = [];
  for (const cand of candidates) {
    const hexOut = toHex(cand);
    if (hexOut !== self && !out.includes(hexOut)) out.push(hexOut);
    if (out.length === 6) break;
  }
  for (let step = 1; out.length < 6; step += 1) out.push(toHex({ ...c, l: clamp(c.l + 0.05 * step * (step % 2 ? 1 : -1)) }));
  return out;
}

/** A typed colour as stored: `#RRGGBB`, or null when it is not one. */
export function cleanHex(text: string): string | null {
  const t = text.trim().replace(/^([0-9a-f]{6})$/i, "#$1");
  return HEX.test(t) ? t.toUpperCase() : null;
}
