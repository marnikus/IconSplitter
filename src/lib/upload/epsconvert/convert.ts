// convert.ts — dispatch SVG → EPS by catalog id (D1/D7). Builtin is the
// in-process writer; Inkscape never silently substitutes it.

import { writeEps } from "../eps";
import { writerOf } from "./catalog";
import { convertWithInkscape } from "./inkscape";
import type { CliHost, ConverterId, ConvertRequest, ConvertResult } from "./types";

/** One converter, one result. The host is ignored for builtin. */
export async function convertSvgToEps(id: ConverterId, req: ConvertRequest, host: CliHost): Promise<ConvertResult> {
  if (id === "inkscape") return convertWithInkscape(req, host);
  return convertBuiltin(req);
}

function convertBuiltin(req: ConvertRequest): ConvertResult {
  const writer = writerOf("builtin");
  const result = writeEps(req.svgText, req.background, req.opts);
  if (!result.ok) return { ok: false, reason: result.reason, writer };
  return { ok: true, eps: result.eps, writer, boundingBox: result.boundingBox, shapes: result.shapes, fixes: result.fixes };
}
