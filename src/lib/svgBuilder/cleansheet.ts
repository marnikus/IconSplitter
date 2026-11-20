// cleansheet.ts — the sheet's clean copy (2026-11-19). The SVG to upload tab
// has always shipped files through the stock-clean policy (lib/upload/clean);
// the builder's own sheet package never did, so a saved artboard carried the
// generator's paperwork: `data-*` hooks (asset ids, cell indexes, a config hash,
// approve flags), a provenance `<metadata>` JSON block, xmlns declarations
// repeated on every stitched child, editor comments/classes and float noise like
// `stroke-width="1.9992750000000001"`. This runs that same policy over the
// finished sheet, keeping the picture, its Title/description and its tags.
//
// Why not `verifyExportSvg`: that is the ICON contract (SVG 1.1 root, no px
// width/height beside the viewBox). A sheet is a page — the package sizes its
// JPEG and 2× PNG from those px — so the px size is captured and put back.
import { cleanExportDom } from "../upload/cleandom";
import { tidySheetTree } from "./cleantree";

export interface SheetCleanReport {
  /** Naming/editor attributes the policy dropped (`data-*`, `class`, `aria-*`…). */
  attributes: number;
  /** Provenance nodes dropped: our machine record and editor comments. */
  elements: number;
  /** Attribute values rewritten from float noise to 3 decimals. */
  rounded: number;
}

export interface SheetCleanResult {
  svg: string;
  report: SheetCleanReport;
  /** Non-null when the document holds content this pass refuses to touch. */
  refused: string | null;
}

/** The project's float precision (the same 3 decimals SVGO keeps). */
const LONG_DECIMAL = /-?\d+\.\d{4,}/g;
const EMPTY: SheetCleanReport = { attributes: 0, elements: 0, rounded: 0 };

/** The cleaned copy; the input string is untouched. */
export function cleanSheetSvg(svgText: string): SheetCleanResult {
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
  trimSheetTree(root);
  restoreSize(root, size);
  const rounded = roundNumbers(root);
  return {
    svg: new XMLSerializer().serializeToString(root),
    report: { attributes: before - countAttributes(root), elements, rounded },
    refused: null,
  };
}

/** The tidy passes; a node removed here is counted with the provenance ones. */
function trimSheetTree(root: Element): number {
  const tidy = tidySheetTree(root);
  return tidy.nodes;
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
