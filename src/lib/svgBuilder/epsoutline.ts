// epsoutline.ts — the EPS stage's text rule for a composed sheet (2026-11-19).
// A sheet ALWAYS carries live <text> (banner title, subtitle, captions), and the
// built-in Level-3 writer's documented subset stops at shapes: without this the
// builder could never ship an EPS. So for the built-in converter the document
// handed to the writer gets the SHARED expandTextToFills pass (the upload tab's
// own code) and the adjustment is REPORTED as an EPS auto-fix — informed, never
// asked (RULE 22/24). Inkscape's CLI already outlines text
// (`--export-text-to-path`), so its document is never touched twice. What cannot
// be outlined stays untouched and fails the stage honestly with both ways out.
import type { ExportFormatOptions } from "../exportformats";
import { expandTextToFills, type TextOutliner } from "../upload/expandtext";

export const EPS_TEXT_FIX = "live <text> outlined to filled paths for the built-in EPS writer";

/** Both honest ways to make a sheet's text EPS-ready, said in one line. */
export const EPS_TEXT_HINT = "untick Also write EPS, tick Expand text to fills, or choose the Inkscape converter";

export type EpsOutlineResult =
  | { ok: true; svg: string; fixes: string[] }
  | { ok: false; svg: string; reason: string; fix: string };

const hasText = (svg: string): boolean => /<text[\s>]/.test(svg);

/**
 * Must the caller load fonts before it builds the package? The browser outliner
 * is SYNC over a cache, so an export that will outline (Expand text to fills, or
 * the built-in EPS stage above) has to warm it first — otherwise a stage that
 * could have succeeded reports "no outlines for this font".
 */
export function needsTextFonts(o: Pick<ExportFormatOptions, "expandText" | "includeEps" | "epsConverter">): boolean {
  return o.expandText || (o.includeEps && o.epsConverter === "builtin");
}

/** The document the EPS converter should receive, plus what was adjusted to get it. */
export function outlineForEps(
  svg: string,
  o: Pick<ExportFormatOptions, "epsConverter">,
  outliner?: TextOutliner | null,
): EpsOutlineResult {
  if (o.epsConverter !== "builtin" || !hasText(svg)) return { ok: true, svg, fixes: [] };
  // `undefined` = whatever this machine can really outline with; `null` = a
  // caller/test that deliberately has none (still an honest refusal below).
  const outlined = expandTextToFills(svg, outliner === undefined ? undefined : { outliner });
  if (!outlined.ok) return { ok: false, svg, reason: outlined.reason, fix: EPS_TEXT_HINT };
  if (outlined.runs === 0) return { ok: true, svg, fixes: [] };
  return { ok: true, svg: outlined.svg, fixes: [EPS_TEXT_FIX] };
}
