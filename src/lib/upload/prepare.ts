// prepare.ts — the export SVG copy of the "SVG to upload" tab (RULE 1/3): the
// orchestrator. The approved source is parsed, never modified; the export
// document is a re-rooted copy built in two phases (clean, then place — see
// preparebuild.ts), preceded since 2026-11-17 by the text-outline stage and
// followed by the full-artboard rescale (the shared format domain). "Default"
// settings ship the approved text AS IS (lib/upload/asis). Every refusal is
// named; the stages themselves live in preparebuild / prepareframe / clean /
// place so this file stays the map, not the territory.
import { cleanExportDom, unsupportedContent } from "./clean";
import { visibleBounds } from "./geom/bounds";
import { expandTextToFills } from "./expandtext";
import { rescaleSvg } from "./rescale";
import { isAsIs } from "./asis";
import { asIsPrepared, name, sizeOf, viewBoxOf } from "./prepareframe";
import { buildExport, shadowSourceFrame } from "./preparebuild";
import { fail, type PrepareFailure, type PrepareResult, type PreparedSvg } from "./preparetypes";
import type { UploadSettings } from "./settings";

export type { PrepareFailureCode, PreparedSvg, PrepareResult, PrepareFailure } from "./preparetypes";

/** Source SVG text + effective settings → the export copy, or an honest failure. */
export function prepareExportSvg(sourceSvg: string, settings: UploadSettings): PrepareResult {
  const outline = outlineSource(sourceSvg, settings);
  if (!outline.ok) return outline;
  const doc = parseSvgDocument(outline.svg);
  if (doc === null) return fail("parse", "the source is not well-formed XML");
  const root = doc.documentElement;
  const same = isAsIs(settings) ? asIsPrepared(sourceSvg, root) : null;
  if (same !== null) return same;
  const veto = sourceVeto(root);
  return veto !== null ? veto : buildPrepared(doc, root, settings);
}

/**
 * Text outlines FIRST (2026-11-17): the geometry chain refuses live <text>, so
 * expanding happens on the source copy and the outlines bake and place like
 * any other artwork. Off = today's honest refusal.
 */
function outlineSource(sourceSvg: string, settings: UploadSettings): { ok: true; svg: string } | PrepareFailure {
  if (!settings.expandText) return { ok: true, svg: sourceSvg };
  const outlined = expandTextToFills(sourceSvg);
  return outlined.ok ? { ok: true, svg: outlined.svg } : fail("unsupported", outlined.reason);
}

/** Clean → measure → shadow frame → place: everything after the source veto. */
function buildPrepared(doc: Document, root: Element, settings: UploadSettings): PrepareResult {
  const frame = viewBoxOf(root) ?? sizeOf(root); // capture width/height before clean removes them
  cleanExportDom(root as Element, { keepRootEmbeds: false });
  const bounds = cleanedBounds(root);
  if (bounds !== null) return bounds;
  const shade = shadowSourceFrame(root, frame, settings.shadowEnabled);
  if (shade.failure !== null) return shade.failure;
  const built = buildExport(doc, root, settings, shade.frame);
  return built.ok ? finishCopy(built, settings) : built;
}

/** The clean pass's verdict: unsupported content, or no visible geometry at all. */
function cleanedBounds(root: Element): PrepareFailure | null {
  const vb = visibleBounds(root);
  if (vb !== null && vb.unsupported.length > 0) return fail("unsupported", `unsupported content: ${vb.unsupported.join(", ")}`);
  return vb === null ? fail("no-geometry", "the document has no visible geometry") : null;
}

/** The last stage (2026-11-17): the full-artboard rescale; its refusal names itself. */
function finishCopy(built: PreparedSvg, settings: UploadSettings): PrepareResult {
  if (!settings.rescaleArtboard) return { ...built, ok: true };
  const scaled = rescaleSvg(built.svg, settings);
  return scaled.ok ? { ...built, svg: scaled.svg, ok: true } : fail("unsupported", scaled.reason);
}

/**
 * Only failures the SOURCE itself causes, checked before anything is built:
 * a root that is not a plain `<svg>`, a root transform, and the content the
 * clean policy refuses outright (raster, unfoldable stylesheets) — fail-closed,
 * because cleaning those WOULD change the picture.
 */
function sourceVeto(root: Element | null): PrepareFailure | null {
  if (root === null || name(root) !== "svg") return fail("parse", "the document root is not an <svg> element");
  if (root.getAttribute("transform") !== null) return fail("unsupported", "a transform on the root <svg> element");
  const unsupported = unsupportedContent(root);
  return unsupported === null ? null : fail("unsupported", unsupported);
}

function parseSvgDocument(source: string): Document | null {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || name(root) === "parsererror" || doc.querySelector("parsererror") !== null) return null;
  return doc;
}
