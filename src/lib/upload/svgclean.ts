// svgclean.ts — one clean copy of an SVG, for both exporters (2026-11-19;
// shared with the upload chain 2026-11-20). The stock-clean policy
// (`lib/upload/clean`) removes paperwork from whatever the upload tab prepares,
// but a saved file still carried machine-shaped leftovers: `data-*` hooks (asset
// ids, cell indexes, a config hash, approve flags), a provenance `<metadata>`
// JSON block, xmlns declarations repeated on every copied child, editor
// comments/classes, dead `color`, paint that only repeats what is inherited,
// bare `<g>` wrappers and float noise like `stroke-width="1.9992750000000001"`.
// This runs the whole policy — policy, tidy passes, rounding — over finished
// SVG text, keeping the picture, its Title/description and its tags.
//
// Two callers, one policy:
//   • the builder sheet package (`svgBuilder/cleansheet.ts`), which keeps the
//     root's px size (`keepSize`) because a page is sized from it;
//   • the upload export stage (`upload/exportstages.ts`), which must NOT learn
//     px width/height back — that is the icon contract (`verifyExportSvg`).
import { cleanExportDom } from "./cleandom";
import { tidySvgTree } from "./svgtidy";

export interface SvgCleanReport {
  /** Naming/editor attributes the policy dropped (`data-*`, `class`, `aria-*`…). */
  attributes: number;
  /** Provenance nodes dropped: our machine record and editor comments. */
  elements: number;
  /** Attribute values rewritten from float noise to 3 decimals. */
  rounded: number;
}

export interface SvgCleanResult {
  svg: string;
  report: SvgCleanReport;
  /** Non-null when the document holds content this pass refuses to touch. */
  refused: string | null;
}

export interface SvgCleanOptions {
  /** Put the root's own `width`/`height` back after the policy drops them. */
  keepSize?: boolean;
}

/** The project's float precision (the same 3 decimals SVGO keeps). */
const LONG_DECIMAL = /-?\d+\.\d{4,}/g;
const EMPTY: SvgCleanReport = { attributes: 0, elements: 0, rounded: 0 };

/** The cleaned copy; the input string is untouched. */
export function cleanSvgText(svgText: string, opts: SvgCleanOptions = {}): SvgCleanResult {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;
  if (root === null || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length > 0) {
    return { svg: svgText, report: EMPTY, refused: "the document does not parse as an SVG" };
  }
  const raster = root.getElementsByTagName("image")[0];
  if (raster !== undefined) {
    return { svg: svgText, report: EMPTY, refused: `a raster <${raster.nodeName.toLowerCase()}> element cannot be cleaned` };
  }
  const size = { width: root.getAttribute("width"), height: root.getAttribute("height") };
  const before = countAttributes(root);
  const elements = dropJunkMetadata(root) + countComments(root);
  cleanExportDom(root, { keepRootEmbeds: true });
  dropNestedNamespaces(root);
  const tidy = tidySvgTree(root);
  if (opts.keepSize === true) restoreSize(root, size);
  const rounded = roundNumbers(root);
  return {
    svg: new XMLSerializer().serializeToString(root),
    report: { attributes: before - countAttributes(root), elements: elements + tidy.nodes, rounded },
    refused: null,
  };
}

/** The artboard's px: a page keeps them, the icon policy had dropped them. */
function restoreSize(root: Element, size: { width: string | null; height: string | null }): void {
  if (size.width !== null) root.setAttribute("width", size.width);
  if (size.height !== null) root.setAttribute("height", size.height);
}

/**
 * Only the tags block is metadata here: a `<metadata>` without a Dublin Core
 * subject is a machine's own record (ours is `<metadata>{"v":1,…}</metadata>`,
 * an XMP blob from another editor is the same problem) and goes.
 */
function hasTagList(el: Element): boolean {
  return Array.from(el.getElementsByTagName("*")).some((child) => (child.localName ?? "").toLowerCase() === "subject");
}

function dropJunkMetadata(root: Element): number {
  let dropped = 0;
  for (const el of Array.from(root.getElementsByTagName("metadata"))) {
    if (hasTagList(el)) continue;
    el.parentNode?.removeChild(el);
    dropped += 1;
  }
  return dropped;
}

/**
 * A stitched sheet repeats `xmlns="…"` on every child it copied in. The root
 * declares it once; the duplicates are the pipeline's fingerprint, not content.
 */
function dropNestedNamespaces(root: Element): void {
  const declared = root.getAttribute("xmlns");
  for (const el of Array.from(root.getElementsByTagName("*"))) {
    const own = el.getAttribute("xmlns");
    if (own !== null && (declared === null || own === declared)) el.removeAttribute("xmlns");
  }
}

/** Editor comments: the policy drops them too, counted here for the report. */
function countComments(root: Element): number {
  return (new XMLSerializer().serializeToString(root).match(/<!--/g) ?? []).length;
}

function countAttributes(root: Element): number {
  return [root, ...Array.from(root.getElementsByTagName("*"))].reduce((sum, el) => sum + el.attributes.length, 0);
}

/**
 * `stroke-width="1.9992750000000001"` → `"1.999"`: footprints of a stitched
 * sheet's group-collapse arithmetic. Only values with 4+ decimals are touched,
 * so an authored 2-decimal width (or `letter-spacing="0.025em"`) stays verbatim.
 */
function roundNumbers(root: Element): number {
  let changed = 0;
  for (const el of [root, ...Array.from(root.getElementsByTagName("*"))]) {
    for (const attribute of Array.from(el.attributes)) {
      const next = attribute.value.replace(LONG_DECIMAL, (number) => String(Number(Number(number).toFixed(3))));
      if (next !== attribute.value) {
        el.setAttribute(attribute.name, next);
        changed += 1;
      }
    }
  }
  return changed;
}
