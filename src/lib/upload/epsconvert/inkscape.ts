// inkscape.ts — Inkscape CLI framework (D4/D7/D10): job in, EPS out, through
// CliHost. Never falls back to the builtin writer. Abort is interruption.

import { writerOf } from "./catalog";
import type { CliHost, ConvertRequest, ConvertResult } from "./types";

const WRITER = writerOf("inkscape");
export const INKSCAPE_UNAVAILABLE = "Inkscape CLI is not available in this browser";

/** SVG text → Inkscape EPS via the host, or an honest reason. */
export async function convertWithInkscape(req: ConvertRequest, host: CliHost): Promise<ConvertResult> {
  if (req.signal?.aborted) return fail("interrupted");
  const run = await host.runInkscape({ svgText: req.svgText, title: req.opts.title ?? "export.eps" }, req.signal);
  if (!run.ok) return fail(run.reason);
  return { ok: true, eps: run.eps, writer: WRITER, boundingBox: null, shapes: 0, fixes: [], engine: run.version };
}

function fail(reason: string): ConvertResult {
  return { ok: false, reason, writer: WRITER };
}
