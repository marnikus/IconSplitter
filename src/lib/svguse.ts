// svguse.ts — expands `<use href="#id">` into a real copy of its target
// (2026-11-03). Chat replies often draw one half and mirror it with `<use>`;
// the saved icon should not depend on id references that later edits, stroke
// checks or exports may not follow. A `<use>` whose target is missing, or code
// that does not parse, is left exactly as it was.

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const MAX_PASSES = 4;

function targetIdOf(use: Element): string | null {
  const ref = use.getAttribute("href") ?? use.getAttributeNS(XLINK_NS, "href") ?? use.getAttribute("xlink:href");
  return ref !== null && ref.startsWith("#") && ref.length > 1 ? ref.slice(1) : null;
}

/** The `<use>` placement as one transform: its own transform, then x/y. */
function placementOf(use: Element): string {
  const parts: string[] = [];
  const own = use.getAttribute("transform");
  if (own !== null && own.trim() !== "") parts.push(own.trim());
  const x = Number(use.getAttribute("x") ?? 0) || 0;
  const y = Number(use.getAttribute("y") ?? 0) || 0;
  if (x !== 0 || y !== 0) parts.push(`translate(${x} ${y})`);
  return parts.join(" ");
}

function stripIds(el: Element): void {
  el.removeAttribute("id");
  for (const child of Array.from(el.querySelectorAll("[id]"))) child.removeAttribute("id");
}

/** One pass; returns how many `<use>` elements were replaced. */
function expandPass(doc: Document): number {
  let count = 0;
  for (const use of Array.from(doc.getElementsByTagNameNS(SVG_NS, "use"))) {
    const id = targetIdOf(use);
    const target = id === null ? null : doc.getElementById(id) ?? doc.querySelector(`[id="${CSS.escape(id)}"]`);
    if (target === null || target.contains(use)) continue;
    const copy = target.cloneNode(true) as Element;
    stripIds(copy);
    const group = doc.createElementNS(SVG_NS, "g");
    const placement = placementOf(use);
    if (placement !== "") group.setAttribute("transform", placement);
    group.appendChild(copy);
    use.replaceWith(group);
    count += 1;
  }
  return count;
}

export function expandUses(code: string): string {
  if (!/<use\b/i.test(code)) return code;
  const doc = new DOMParser().parseFromString(code, "image/svg+xml");
  if (doc.getElementsByTagName("parsererror").length > 0 || doc.documentElement.localName !== "svg") return code;
  let total = 0;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const done = expandPass(doc);
    total += done;
    if (done === 0) break;
  }
  return total === 0 ? code : new XMLSerializer().serializeToString(doc.documentElement);
}
