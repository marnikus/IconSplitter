// cleandom.ts — the REBUILDING pass of the clean export policy (2026-10-08,
// RULE 3/18): the half that changes a document instead of judging it. It folds
// a simple paint-only stylesheet into the elements (which is what lets the
// class names go), drops every naming attribute and every foreign element,
// keeps a referenced id under a minimal generated name, and guarantees the
// SVG 1.1 root. Geometry, paints and the viewBox are never touched: this pass
// changes the paperwork, never the picture.
//
// What it cannot fold is refused by `unsupportedContent` — never guessed at
// (RULE 5): raster content, and any stylesheet outside the documented subset.

import {
  allElements, attributeNames, comments, isIdReference, isSvgElement,
  localName, referencedIds, rewriteRefs,
} from "./svgdom";

/** Attributes that are naming or editor bookkeeping, never rendering. */
export const BLOAT_ATTRS = ["class", "role", "xml:space", "enable-background"];
/** Ours are added deliberately at the root by lib/upload/embed, never inherited. */
export const EMBED_TAGS = ["title", "desc", "metadata"];
/**
 * The properties a stylesheet may set for us to inline it. PAINT only: nothing
 * here can move, hide or clip geometry, so folding it into the elements cannot
 * change what the icon looks like — it only removes the class names.
 */
export const INLINE_PROPS = [
  "color", "fill", "fill-opacity", "fill-rule", "clip-rule", "opacity",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity",
];

export interface CleanOptions {
  /**
   * Keep the root-level `<title>/<desc>/<metadata>` that OUR embed added. The
   * source document's own ones are naming from whoever drew the icon and are
   * always removed (prepare passes `false`, the rebuild defaults to `true`).
   */
  keepRootEmbeds?: boolean;
}

/** Element names that cannot be cleaned without changing the picture. */
export function unsupportedContent(root: Element): string | null {
  for (const el of allElements(root)) {
    if (localName(el) === "image") return "an embedded raster <image> element";
  }
  return foldStylesheets(root);
}

/** Folds every paint-only `<style>` block it can; reports the first it cannot. */
function foldStylesheets(root: Element): string | null {
  let refusal: string | null = null;
  for (const block of allElements(root).filter((el) => localName(el) === "style")) {
    const rules = parseCssSubset(block.textContent ?? "");
    if (rules === null) {
      refusal ??= "a <style> block that is not a simple paint-only rule list";
      continue;
    }
    applyRules(root, rules);
    block.parentNode?.removeChild(block);
  }
  return refusal;
}

/** The rebuilding pass. Idempotent: running it twice changes nothing the second time. */
export function cleanExportDom(root: Element, opts: CleanOptions = {}): void {
  root.setAttribute("version", "1.1");
  foldInlineStyles(root);
  // Fold what we can BEFORE removing anything: a block that is merely deleted
  // would take its paint with it and silently change the picture. A block the
  // subset cannot fold stays in the tree, so the check keeps flagging it.
  foldStylesheets(root);
  for (const node of comments(root)) node.parentNode?.removeChild(node);
  for (const el of allElements(root)) removeJunkElement(el, opts);
  for (const el of allElements(root)) stripAttributes(el);
  renameReferencedIds(root);
  dropUnusedNamespaces(root);
}

/** `style="fill:#000"` → `fill="#000"`, for the properties we are allowed to inline. */
function foldInlineStyles(root: Element): void {
  for (const el of allElements(root)) {
    const style = el.getAttribute("style");
    if (style === null) continue;
    const kept = style.split(";").map((decl) => foldDeclaration(el, decl)).filter((decl) => decl !== null);
    setStyle(el, kept as string[]);
  }
}

/** Folds one declaration into an attribute, or hands it back for the style to keep. */
function foldDeclaration(el: Element, decl: string): string | null {
  const at = decl.indexOf(":");
  const prop = at < 0 ? "" : decl.slice(0, at).trim().toLowerCase();
  if (!INLINE_PROPS.includes(prop)) return decl.trim() === "" ? null : decl.trim();
  el.removeAttribute(prop);
  el.setAttribute(prop, decl.slice(at + 1).trim());
  return null;
}

function setStyle(el: Element, decls: string[]): void {
  const kept = decls.filter((decl) => decl !== "");
  if (kept.length === 0) el.removeAttribute("style");
  else el.setAttribute("style", kept.join("; "));
}

interface CssRule {
  /** A class name, or an element name when `tag` is set. */
  selector: { tag?: string; cls?: string };
  props: [string, string][];
}

/** The documented subset: `sel { prop: value; … }`, selectors `.cls` / `tag`, paint props only. */
function parseCssSubset(css: string): CssRule[] | null {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (text === "") return []; // an empty block is still removable without touching the picture
  if (text.includes("@") || text.includes("!")) return null;
  const rules: CssRule[] = [];
  for (const chunk of text.split("}")) {
    const brace = chunk.indexOf("{");
    if (brace < 0) {
      if (chunk.trim() !== "") return null;
      continue;
    }
    const selectors = chunk.slice(0, brace).split(",").map((sel) => parseSelector(sel.trim()));
    const props = parseDeclarations(chunk.slice(brace + 1));
    if (selectors.some((sel) => sel === null) || props === null) return null;
    for (const selector of selectors) rules.push({ selector: selector as CssRule["selector"], props });
  }
  return rules;
}

function parseSelector(sel: string): CssRule["selector"] | null {
  if (/^\.[A-Za-z_][\w-]*$/.test(sel)) return { cls: sel.slice(1) };
  if (/^[a-zA-Z][\w-]*$/.test(sel)) return { tag: sel.toLowerCase() };
  return null;
}

function parseDeclarations(body: string): [string, string][] | null {
  const out: [string, string][] = [];
  for (const decl of body.split(";")) {
    const trimmed = decl.trim();
    if (trimmed === "") continue;
    const at = trimmed.indexOf(":");
    if (at < 0) return null;
    const prop = trimmed.slice(0, at).trim().toLowerCase();
    const value = trimmed.slice(at + 1).trim();
    if (!INLINE_PROPS.includes(prop) || value === "") return null;
    if (value.includes("var(") || (value.includes("url(") && !isIdReference(value))) return null;
    out.push([prop, value]);
  }
  return out;
}

/** Writes a rule's properties onto the elements it selects, as plain attributes. */
function applyRules(root: Element, rules: CssRule[]): void {
  const elements = allElements(root);
  for (const { selector, props } of rules) {
    for (const el of elements.filter((candidate) => matches(candidate, selector))) {
      for (const [prop, value] of props) {
        el.removeAttribute(prop);
        el.setAttribute(prop, value);
      }
    }
  }
}

function matches(el: Element, selector: CssRule["selector"]): boolean {
  if (selector.cls !== undefined) {
    return (el.getAttribute("class") ?? "").split(/\s+/).includes(selector.cls);
  }
  return localName(el) === selector.tag;
}

function stripAttributes(el: Element): void {
  for (const name of attributeNames(el)) {
    if (name.startsWith("xmlns:") || name.startsWith("xlink:")) continue;
    const drop = name.includes(":") || BLOAT_ATTRS.includes(name)
      || name.startsWith("data-") || name.startsWith("aria-");
    if (drop) el.removeAttribute(name);
  }
}

function removeJunkElement(el: Element, opts: CleanOptions): void {
  const embed = EMBED_TAGS.includes(localName(el));
  const nested = el.parentElement?.parentElement !== null;
  const junk = !isSvgElement(el) || (embed && (nested || opts.keepRootEmbeds !== true));
  if (junk) el.parentNode?.removeChild(el);
}

/** Renames every referenced id to a, b, c… in document order, refs included. */
function renameReferencedIds(root: Element): void {
  const elements = allElements(root);
  const referenced = referencedIds(elements);
  const map = new Map<string, string>();
  for (const el of elements) {
    const id = el.getAttribute("id");
    if (id === null) continue;
    if (!referenced.has(id)) el.removeAttribute("id");
    else if (!map.has(id)) {
      const name = alphaName(map.size);
      map.set(id, name);
      el.setAttribute("id", name);
    } else {
      el.removeAttribute("id"); // a second element with the same id paints nothing extra
    }
  }
  if (map.size === 0) return;
  for (const el of allElements(root)) rewriteRefs(el, map);
}

/** Declarations are bookkeeping: only a USED `xmlns:xlink` is allowed to stay. */
function dropUnusedNamespaces(root: Element): void {
  const usesXlink = allElements(root).some((el) => attributeNames(el).some((a) => a.startsWith("xlink:")));
  for (const el of allElements(root)) {
    for (const name of attributeNames(el)) {
      if (name.startsWith("xmlns:") && !(name === "xmlns:xlink" && usesXlink)) {
        el.removeAttribute(name);
      }
    }
  }
}

function alphaName(index: number): string {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(97 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}
