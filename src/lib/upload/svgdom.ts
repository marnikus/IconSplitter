// svgdom.ts — the small DOM helpers the clean policy shares (2026-10-08,
// RULE 3/18). Pure functions over a parsed document: no policy lives here, so
// the check (clean.ts) and the rebuilding pass (cleandom.ts) agree on what an
// element, an attribute name or a reference IS.
//
// Reads go through `nodeName`/`attributes` rather than the namespace API alone:
// an XML parser is free to leave a foreign element's namespace unresolved, and
// a prefixed name is exactly what editor bloat looks like.

export const SVG_NS = "http://www.w3.org/2000/svg";
const ID_REF = /url\(\s*#([^)\s"']+)\s*\)/g;

/** The root and every descendant, in document order. */
export function allElements(root: Element): Element[] {
  return [root, ...Array.from(root.querySelectorAll("*"))];
}

export function attributeNames(el: Element): string[] {
  return Array.from(el.attributes).map((a) => a.name);
}

export function localName(el: Element): string {
  const at = el.nodeName.indexOf(":");
  const name = at >= 0 ? el.nodeName.slice(at + 1) : el.nodeName;
  return name.toLowerCase();
}

/** SVG content only: a prefix means somebody else's vocabulary came along. */
export function isSvgElement(el: Element): boolean {
  const ns = el.namespaceURI ?? SVG_NS;
  return ns === SVG_NS && !el.nodeName.includes(":");
}

/** True for the deliberate `<metadata>` subtree (its vocabulary is RDF, not SVG). */
export function insideMetadata(el: Element): boolean {
  let node: Element | null = el;
  while (node !== null) {
    if (localName(node) === "metadata") return true;
    node = node.parentElement;
  }
  return false;
}

/** Every comment in the tree — editor bloat, never rendering. */
export function comments(root: Element): Comment[] {
  const out: Comment[] = [];
  const visit = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 8) out.push(child as Comment);
      else visit(child);
    }
  };
  visit(root);
  return out;
}

/** Ids some attribute really points at: `url(#x)` and `href="#x"`. */
export function referencedIds(elements: Element[]): Set<string> {
  const ids = new Set<string>();
  for (const el of elements) {
    for (const name of attributeNames(el)) {
      const value = el.getAttribute(name) ?? "";
      for (const m of value.matchAll(ID_REF)) ids.add(m[1]);
      if ((name === "href" || name.endsWith(":href")) && value.startsWith("#")) ids.add(value.slice(1));
    }
  }
  return ids;
}

/** The same reference syntax, applied: `url(#old)`/`#old` → the mapped name. */
export function rewriteRefs(el: Element, map: Map<string, string>): void {
  for (const name of attributeNames(el)) {
    const value = el.getAttribute(name) ?? "";
    const next = value
      .replace(ID_REF, (whole, id: string) => (map.has(id) ? `url(#${map.get(id)})` : whole))
      .replace(/^#(.+)$/, (whole, id: string) => (map.has(id) ? `#${map.get(id)}` : whole));
    if (next !== value) el.setAttribute(name, next);
  }
}

/** Is `value` a plain `url(#id)` reference (and nothing else)? */
export function isIdReference(value: string): boolean {
  ID_REF.lastIndex = 0;
  const plain = ID_REF.test(value);
  ID_REF.lastIndex = 0;
  return plain;
}
