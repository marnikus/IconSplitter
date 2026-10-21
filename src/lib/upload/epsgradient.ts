// SVG gradient references/stops, resolved without fetching or rendering pixels.
import { styleMap } from "./geom/stroke";
import { paintOf, opacityOf, Unsupported, type Rgb } from "./epspaint";

export interface GradientStop { offset: number; color: Rgb; alpha: number }
export interface GradientSource {
  radial: boolean;
  attr: (name: string) => string | null;
  stops: GradientStop[];
}

export function resolveGradient(root: Element, id: string): GradientSource {
  const chain = referenceChain(root, id);
  const attr = (name: string): string | null => {
    for (const el of chain) {
      const value = styleMap(el.getAttribute("style"))[name] ?? el.getAttribute(name);
      if (value !== null) return value;
    }
    return null;
  };
  if ((attr("spreadMethod") ?? "pad") !== "pad") throw new Unsupported("EPS vector gradients support spreadMethod=pad only");
  if ((attr("color-interpolation") ?? "sRGB") !== "sRGB") throw new Unsupported("EPS vector gradients require sRGB color interpolation");
  const owner = chain.find((el) => el.children.length > 0);
  if (owner === undefined) throw new Unsupported("gradient has no stops");
  return { radial: chain[0].localName === "radialGradient", attr, stops: readStops(owner) };
}

function referenceChain(root: Element, id: string): Element[] {
  const chain: Element[] = [];
  let next: string | null = `#${id}`;
  while (next !== null) {
    if (!next.startsWith("#")) throw new Unsupported("external gradient references are forbidden");
    const found = Array.from(root.querySelectorAll("[id]")).filter((el) => el.id === next!.slice(1));
    const el = found[0];
    if (found.length !== 1 || !["linearGradient", "radialGradient"].includes(el?.localName)) throw new Unsupported("missing or ambiguous gradient reference");
    if (chain.includes(el) || chain.length >= 32) throw new Unsupported("cyclic or excessive gradient references");
    chain.push(el);
    next = el.getAttribute("href") ?? el.getAttribute("xlink:href");
  }
  return chain;
}

function readStops(el: Element): GradientStop[] {
  const stops = Array.from(el.children).map(readStop);
  if (stops.length === 0 || stops.length > 256) throw new Unsupported("gradient stop count is unsupported");
  for (let i = 1; i < stops.length; i++) {
    if (stops[i].offset <= stops[i - 1].offset) throw new Unsupported("gradient offsets must be strictly increasing");
  }
  if (stops[0].offset > 0) stops.unshift({ ...stops[0], offset: 0 });
  if (stops[stops.length - 1].offset < 1) stops.push({ ...stops[stops.length - 1], offset: 1 });
  if (stops.length === 1) stops.push({ ...stops[0], offset: 1 });
  return stops;
}

function readStop(el: Element): GradientStop {
  if (el.localName !== "stop") throw new Unsupported("non-stop element in gradient");
  const style = styleMap(el.getAttribute("style"));
  const color = paintOf(style["stop-color"] ?? el.getAttribute("stop-color") ?? "black");
  if (color === null) throw new Unsupported("invalid gradient stop color");
  const raw = el.getAttribute("offset") ?? "0";
  const offset = scalar(raw);
  return { offset: Math.min(1, Math.max(0, offset)), color,
    alpha: opacityOf(style["stop-opacity"] ?? el.getAttribute("stop-opacity"), 1) };
}

/** Finite SVG scalar/percentage, never Number('') or a guessed unit. */
export function scalar(raw: string): number {
  if (!/^[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?%?$/i.test(raw.trim())) throw new Unsupported("invalid gradient number");
  const value = raw.trim();
  const n = value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
  if (!Number.isFinite(n)) throw new Unsupported("non-finite gradient number");
  return n;
}
