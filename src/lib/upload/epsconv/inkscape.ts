// inkscape.ts — optional local Inkscape CLI client (`tools/bridge/`, 127.0.0.1).
// Pre-flattens gradient `<stop>` opacities onto `input.background` before Cairo
// renders to EPS (preventing raster fallback on `shadow.svg`), AND enforces
// `verifyEpsDocument` (including the hard zero-raster gate) on the response.

import { builtinConverter } from "./builtin";
import { findRasterOperators } from "../epscheck";
import { styleMap } from "../geom/stroke";
import { mix, opacityValue, paintColor, urlRefId, type Rgb } from "../epsgradient";
import type { ConvertResult, ConverterDeps, ConverterState, EpsConverter, EpsConvertInput } from "./types";

export const START_HELPER_FIX = "start run_inkscape_bridge.bat (or run_app_inkscape.bat) and keep its window open";
export const INSTALL_INKSCAPE_FIX = "install Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH";
const EPS_HEAD = "%!PS-Adobe";

interface Health {
  ok?: boolean;
  inkscape?: { found?: boolean; version?: string | null; fix?: string | null };
}

export const inkscapeConverter: EpsConverter = {
  id: "inkscape",
  label: "Inkscape CLI (local helper)",
  probe,
  convert,
};

async function probe(deps: ConverterDeps): Promise<ConverterState> {
  let health: Health;
  try {
    const res = await deps.fetch(`${deps.bridgeUrl}/health`, { method: "GET" });
    health = (await res.json()) as Health;
  } catch {
    return { ok: false, reason: unreachable(deps.bridgeUrl), fix: START_HELPER_FIX };
  }
  if (health.inkscape?.found === true) return { ok: true, version: health.inkscape.version ?? "unknown" };
  return { ok: false, reason: "the Inkscape helper is running but Inkscape was not found", fix: health.inkscape?.fix ?? INSTALL_INKSCAPE_FIX };
}

async function convert(input: EpsConvertInput, deps: ConverterDeps, signal?: AbortSignal): Promise<ConvertResult> {
  const preparedSvg = flattenSvgAlphaForPs(input.svg, input.background);
  let res: Response;
  try {
    res = await deps.fetch(`${deps.bridgeUrl}/convert/eps`, {
      method: "POST", body: preparedSvg, headers: { "content-type": "image/svg+xml" }, ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    return { ok: false, reason: unreachable(deps.bridgeUrl), fix: START_HELPER_FIX };
  }
  const body = await res.text();
  if (!res.ok) return { ok: false, reason: reasonOf(body, res.status) };
  if (!body.startsWith(EPS_HEAD)) return { ok: false, reason: "the helper answered with something that is not an EPS" };
  const rasterErrors = findRasterOperators(body);
  if (rasterErrors.length > 0) {
    if (/<(linear|radial)Gradient\b/i.test(input.svg)) {
      const upgraded = await builtinConverter.convert(input, deps, signal);
      if (upgraded.ok) return upgraded;
    }
    return { ok: false, reason: `Inkscape emitted raster EPS: ${rasterErrors[0]}` };
  }
  return { ok: true, eps: body, writer: `inkscape-cli@${res.headers.get("x-inkscape-version") ?? "unknown"}`, fixes: [] };
}

/** Bake gradient `<stop>` opacities onto opaque RGB colors before Cairo sees them. */
export function flattenSvgAlphaForPs(svgText: string, background: string): string {
  if (!/<(linear|radial)Gradient\b/i.test(svgText)) return svgText;
  const bg = safeColor(background);
  if (bg === null) return svgText;
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg") return svgText;
  const gradAlphas = collectGradientAlphas(root);
  flattenGradientStops(root, bg, gradAlphas);
  return root.outerHTML;
}

function collectGradientAlphas(root: Element): Map<string, number> {
  const out = new Map<string, number>();
  for (const el of Array.from(root.querySelectorAll("*"))) {
    const st = styleMap(el.getAttribute("style"));
    for (const [paintKey, alphaKey] of [["fill", "fill-opacity"], ["stroke", "stroke-opacity"]] as const) {
      const id = urlRefId(st[paintKey] ?? el.getAttribute(paintKey));
      if (id === null) continue;
      out.set(id, clampUnit(st[alphaKey] ?? el.getAttribute(alphaKey)));
      el.removeAttribute(alphaKey);
    }
  }
  return out;
}

function flattenGradientStops(root: Element, bg: Rgb, alphas: Map<string, number>): void {
  for (const grad of Array.from(root.querySelectorAll("linearGradient, radialGradient"))) {
    const factor = alphas.get(grad.getAttribute("id") ?? "") ?? 1;
    for (const stop of Array.from(grad.querySelectorAll("stop"))) {
      const st = styleMap(stop.getAttribute("style"));
      const col = safeColor(st["stop-color"] ?? stop.getAttribute("stop-color") ?? "#000000") ?? { r: 0, g: 0, b: 0 };
      const alpha = clampUnit(st["stop-opacity"] ?? stop.getAttribute("stop-opacity")) * factor;
      stop.setAttribute("stop-color", toHex(mix(col, bg, alpha)));
      stop.removeAttribute("stop-opacity");
      stop.removeAttribute("style");
    }
  }
}

function safeColor(raw: string): Rgb | null {
  try {
    return paintColor(raw);
  } catch {
    return null;
  }
}

function clampUnit(raw: string | null): number {
  try {
    return Math.min(1, Math.max(0, opacityValue(raw, 1)));
  } catch {
    return 1;
  }
}

function toHex(c: Rgb): string {
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");
  return `#${byte(c.r)}${byte(c.g)}${byte(c.b)}`;
}

function unreachable(url: string): string {
  return `the Inkscape helper is not reachable at ${url}`;
}

function reasonOf(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { reason?: unknown };
    if (typeof parsed.reason === "string") return parsed.reason;
  } catch { /* not JSON: fall through to the status */ }
  return `the Inkscape helper answered HTTP ${status}`;
}
