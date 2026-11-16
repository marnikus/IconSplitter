// Alpha is composed BEFORE interpolation. Quadratic segments have a proved
// channel error <= 1/8192, plus <= 1e-9 serialization error. Still vector functions.
import { mix, Unsupported, type Rgb } from "./epspaint";
import type { GradientStop } from "./epsgradient";
import type { PsDict } from "./epspsdata";

export const VECTOR_COLOR_ERROR = 1 / 8192;
export interface VectorStop { offset: number; color: number[] }

export function vectorStops(stops: GradientStop[], bg: Rgb, opacity: number): VectorStop[] {
  const out: VectorStop[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const a = stops[i], b = stops[i + 1];
    const product = Math.max(...channels(a.color).map((c, j) => Math.abs((channels(b.color)[j] - c) * (b.alpha - a.alpha) * opacity)));
    const count = Math.max(1, Math.ceil(Math.sqrt(product / (4 * VECTOR_COLOR_ERROR))));
    for (let j = 0; j < count; j++) out.push(composedStop(a, b, j / count, { bg, opacity }));
  }
  const last = stops[stops.length - 1];
  out.push({ offset: last.offset, color: channels(mix(last.color, bg, last.alpha * opacity)) });
  if (out.length > 8193) throw new Unsupported("vector gradient exceeds the color-function segment budget");
  return out;
}

export function gradientFunction(stops: VectorStop[]): PsDict {
  const funcs = stops.slice(0, -1).map((s, i): PsDict => ({
    FunctionType: 2, Domain: [0, 1], C0: s.color, C1: stops[i + 1].color, N: 1,
  }));
  return { FunctionType: 3, Domain: [0, 1], Functions: funcs,
    Bounds: stops.slice(1, -1).map((s) => s.offset), Encode: funcs.flatMap(() => [0, 1]) };
}

function composedStop(a: GradientStop, b: GradientStop, t: number, flatten: { bg: Rgb; opacity: number }): VectorStop {
  const lerp = (x: number, y: number) => x + (y - x) * t;
  const color = { r: lerp(a.color.r, b.color.r), g: lerp(a.color.g, b.color.g), b: lerp(a.color.b, b.color.b) };
  return { offset: lerp(a.offset, b.offset), color: channels(mix(color, flatten.bg, lerp(a.alpha, b.alpha) * flatten.opacity)) };
}

function channels(c: Rgb): number[] { return [c.r, c.g, c.b]; }
