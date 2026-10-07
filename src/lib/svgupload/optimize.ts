// optimize.ts — the SVGO policy of the SVG-to-upload tab (design §11, research 3).
// Why a module of its own: SVGO's `preset-default` includes plugins that would
// break this tab's promises — removeTitle/removeDesc/removeMetadata delete the
// metadata an export exists to carry, and convertPathData/collapseGroups/
// convertTransform rewrite the geometry and the transforms an approved icon was
// signed off on. The override map below turns those OFF and is the ONE place
// that decision lives; the before/after comparison proves it held.

export interface OptimizeOverride {
  name: string;
  why: string;
}

export const OPTIMIZER_NAME = "svgo";

/** Every plugin SVGO 4.1's `preset-default` runs, in its own order. */
export const PRESET_PLUGINS: readonly string[] = [
  "removeDoctype", "removeXMLProcInst", "removeComments", "removeDeprecatedAttrs",
  "removeMetadata", "removeEditorsNSData", "cleanupAttrs", "mergeStyles", "inlineStyles",
  "minifyStyles", "cleanupIds", "removeUselessDefs", "cleanupNumericValues", "convertColors",
  "removeUnknownsAndDefaults", "removeNonInheritableGroupAttrs", "removeUselessStrokeAndFill",
  "cleanupEnableBackground", "removeHiddenElems", "removeEmptyText", "convertShapeToPath",
  "convertEllipseToCircle", "moveElemsAttrsToGroup", "moveGroupAttrsToElems", "collapseGroups",
  "convertPathData", "convertTransform", "removeEmptyAttrs", "removeEmptyContainers",
  "mergePaths", "removeUnusedNS", "sortAttrs", "sortDefsChildren", "removeDesc",
];

/**
 * The only two plugins an export copy may run. Everything else in the preset can
 * alter geometry, paint, structure, ids or metadata — and this tab's whole
 * promise is that the approved artwork comes out the way it went in.
 *
 * `removeEditorsNSData` is REFUSED although its name sounds harmless: measured
 * on a real export it treats the Adobe/RDF namespaces as editor junk and empties
 * the XMP packet (`<metadata/>`), which is the metadata the export exists to
 * carry.
 */
export const ALLOWED_PLUGINS: readonly string[] = ["removeDoctype", "removeComments"];

const WHY: Record<string, string> = {
  removeXMLProcInst: "the export keeps its XML declaration so it opens as XML anywhere",
  removeDeprecatedAttrs: "attribute removal is a document change, not a byte saving",
  removeMetadata: "the XMP packet is the metadata the export carries",
  removeEditorsNSData: "measured: it empties the XMP packet as if rdf:/dc: were editor junk",
  removeDesc: "the description is the metadata the export carries",
  cleanupAttrs: "attribute whitespace is not worth a document change",
  cleanupNumericValues: "the approved numbers are kept as approved",
  convertColors: "colour spelling is left exactly as approved (no recolouring)",
  removeUnknownsAndDefaults: "our own wrapper attributes would look \"unknown\" to it",
  removeNonInheritableGroupAttrs: "it would strip the group the fit and the stroke rule live on",
  removeUselessStrokeAndFill: "fill/stroke declarations decide whether an icon renders at all",
  removeHiddenElems: "a zero-size element can still be referenced by <use>",
  convertShapeToPath: "a rect is not the same document as a path",
  convertEllipseToCircle: "an ellipse is not the same document as a circle",
  moveElemsAttrsToGroup: "transform placement is part of the approved file",
  moveGroupAttrsToElems: "it would move the fit transform off the wrapper group",
  collapseGroups: "the wrapper group carries the fit transform and the stroke rule",
  convertPathData: "path data is the approved geometry; it is not rewritten",
  convertTransform: "transform attribute form is part of the approved file",
  removeEmptyContainers: "it would delete the wrapper group",
  mergePaths: "merging paths can change stroke rendering and opacity",
  removeUnusedNS: "a namespace declaration can be needed by a referenced subtree",
  sortAttrs: "attribute order is part of the approved file",
  sortDefsChildren: "def order is not ours to change",
  cleanupIds: "ids referenced by <use>/<clipPath> would stop resolving",
  removeUselessDefs: "it deletes definitions that references still point at",
  minifyStyles: "the export's own stroke rule lives in a <style> element",
  mergeStyles: "style block structure is part of the document",
  inlineStyles: "inlining CSS rewrites every element it touches",
  cleanupEnableBackground: "an obsolete attribute is still an approved attribute",
  removeEmptyText: "empty text still positions siblings",
};

/** Every preset plugin that is switched off, each with the promise it protects. */
export const REFUSED: readonly OptimizeOverride[] = PRESET_PLUGINS
  .filter((name) => !ALLOWED_PLUGINS.includes(name))
  .map((name) => ({ name, why: WHY[name] ?? "not needed for an export copy" }));

/** The exact config sent to SVGO — data, so it can be recorded in export.json. */
export function optimizeConfig(): { multipass: boolean; plugins: { name: string; params: { overrides: Record<string, boolean> } }[] } {
  const overrides: Record<string, boolean> = {};
  for (const entry of REFUSED) overrides[entry.name] = false;
  return {
    multipass: false, // one pass: with nothing rewritten a second pass cannot help
    plugins: [{ name: "preset-default", params: { overrides } }],
  };
}

/** A comparable reading of a document: the numbers and the artwork, in order. */
export interface SvgSignature {
  viewBox: string;
  width: string;
  height: string;
  /** One entry per drawn element, with the attributes that decide rendering. */
  elements: string[];
  /** Every colour-ish value the document mentions, in document order. */
  paint: string[];
}

const DRAW_RE = /<(path|rect|circle|ellipse|line|polyline|polygon|text|use|g)\b([^>]*)>/g;
const PAINT_RE = /(fill|stroke|stop-color)\s*[:=]\s*("([^"]*)"|([^;>"\s]+))/g;

/** The reading both sides of a comparison are taken with. */
export function svgSignature(svg: string): SvgSignature {
  const root = rootAttrs(svg);
  return {
    viewBox: root.viewBox ?? "",
    width: root.width ?? "",
    height: root.height ?? "",
    elements: [...svg.matchAll(DRAW_RE)].map((m) => `<${m[1]}${normalizeAttrs(m[2])}>`),
    paint: [...svg.matchAll(PAINT_RE)].map((m) => m[3] ?? m[4] ?? "").filter((v) => v !== ""),
  };
}

/** Attribute order and whitespace are not part of "the same picture". */
function normalizeAttrs(attrs: string): string {
  const pairs = [...attrs.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map((m) => `${m[1]}="${m[2].trim()}"`);
  return pairs.length === 0 ? "" : ` ${pairs.sort().join(" ")}`;
}

function rootAttrs(svg: string): Record<string, string> {
  const end = svg.indexOf(">");
  const open = end < 0 ? svg : svg.slice(0, end);
  const out: Record<string, string> = {};
  for (const m of open.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

export interface Diff {
  kind: "viewBox" | "size" | "element" | "paint";
  before: string;
  after: string;
}

/** What changed, element by element — the evidence the tab shows and logs. */
export function compareSignatures(before: SvgSignature, after: SvgSignature): Diff[] {
  const out: Diff[] = [];
  if (before.viewBox !== after.viewBox) out.push({ kind: "viewBox", before: before.viewBox, after: after.viewBox });
  if (before.width !== after.width || before.height !== after.height) {
    out.push({ kind: "size", before: `${before.width}×${before.height}`, after: `${after.width}×${after.height}` });
  }
  out.push(...compareList("element", before.elements, after.elements));
  out.push(...compareList("paint", before.paint, after.paint));
  return out;
}

/** Order matters: a reordered list is a different document for this check. */
function compareList(kind: Diff["kind"], before: readonly string[], after: readonly string[]): Diff[] {
  const out: Diff[] = [];
  const n = Math.max(before.length, after.length);
  for (let i = 0; i < n; i += 1) {
    const a = before[i] ?? "(missing)";
    const b = after[i] ?? "(missing)";
    if (a !== b) out.push({ kind, before: a, after: b });
  }
  return out;
}

/** Bytes of a string, for the export JSON's size accounting. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
