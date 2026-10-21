// Native vector gradient fill. The caller has constructed the original path.
import type { Matrix } from "./geom/matrix";
import { resolveGradient } from "./epsgradient";
import { gradientSpace } from "./epsgradientcoords";
import { gradientFunction, vectorStops } from "./epsgradientfunction";
import { geometryBounds, uniformBackdrop, type PaintMark } from "./epsscene";
import { matrixPs } from "./epstransform";
import { psData } from "./epspsdata";
import { Unsupported, type Rgb } from "./epspaint";
import { checkShading } from "./epsshading";

export interface GradientContext {
  root: Element; viewport: number[]; ctm: Matrix; bg: Rgb; marks: PaintMark[]; evenOdd: boolean;
}

export function gradientFill(el: Element, ref: string, opacity: number, ctx: GradientContext): string {
  const source = resolveGradient(ctx.root, ref);
  const local = geometryBounds(el);
  const space = gradientSpace(source, local, ctx.viewport);
  const transparent = opacity < 1 || source.stops.some((s) => s.alpha < 1);
  const bg = transparent ? uniformBackdrop(geometryBounds(el, ctx.ctm), ctx.marks, ctx.bg) : ctx.bg;
  const fn = gradientFunction(vectorStops(source.stops, bg, opacity));
  const data = psData({ ShadingType: source.radial ? 3 : 2, ColorSpace: "DeviceRGB",
    Coords: space.coords, Function: fn, Extend: [true, true] });
  try { checkShading(data); }
  catch { throw new Unsupported("gradient cannot be represented within EPS numeric precision"); }
  return ` ${ctx.evenOdd ? "eoclip" : "clip"} newpath\n${matrixPs(space.matrix)}\n${data} shfill\n`;
}
