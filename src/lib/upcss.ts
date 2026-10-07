// upcss.ts — the minimal CSS cascade the geometry pipeline needs (prompt §5).
// Owns: collecting the style rules an SVG's own <style> elements declare, and
// resolving the presentation properties of one element against them. Scope is
// deliberately tiny and documented: class selectors (".cls-1") and tag
// selectors only, in document order, later rules winning — exactly what
// generated icon SVGs use. Per the SVG spec a CSS rule overrides a presentation
// attribute; anything fancier (pseudo-classes, combinators, media queries)
// never matches here and is not silently approximated.

export type GeomProp =
  | "fill" | "stroke" | "stroke-width" | "stroke-linejoin" | "stroke-linecap"
  | "stroke-miterlimit" | "fill-rule" | "stroke-dasharray" | "display";

const PROPS: readonly GeomProp[] = [
  "fill", "stroke", "stroke-width", "stroke-linejoin", "stroke-linecap",
  "stroke-miterlimit", "fill-rule", "stroke-dasharray", "display",
];

export interface StyleRule {
  selector: string;
  decls: Partial<Record<GeomProp, string>>;
}

/** Reads every <style> element under the root (defs included). */
export function collectStyleRules(root: Element): StyleRule[] {
  const rules: StyleRule[] = [];
  for (const style of Array.from(root.querySelectorAll("style"))) {
    rules.push(...parseStyleSheet(style.textContent ?? ""));
  }
  return rules;
}

function parseStyleSheet(text: string): StyleRule[] {
  const out: StyleRule[] = [];
  for (const chunk of text.split("}")) {
    const at = chunk.indexOf("{");
    if (at < 0) continue;
    out.push({ selector: chunk.slice(0, at).trim(), decls: parseDecls(chunk.slice(at + 1)) });
  }
  return out;
}

function parseDecls(text: string): Partial<Record<GeomProp, string>> {
  const decls: Partial<Record<GeomProp, string>> = {};
  for (const pair of text.split(";")) {
    const at = pair.indexOf(":");
    if (at < 0) continue;
    const name = pair.slice(0, at).trim();
    if ((PROPS as readonly string[]).includes(name)) {
      decls[name as GeomProp] = pair.slice(at + 1).trim();
    }
  }
  return decls;
}

/** A rule matches only a plain class or tag selector — never a guess. */
export function ruleMatches(rule: StyleRule, el: Element): boolean {
  const sel = rule.selector;
  if (sel.startsWith(".")) return el.classList.contains(sel.slice(1));
  return el.localName === sel;
}

/** The CSS properties that apply to this element, later rules winning. */
export function cssPropsFor(el: Element, rules: StyleRule[]): Partial<Record<GeomProp, string>> {
  const out: Partial<Record<GeomProp, string>> = {};
  for (const rule of rules) {
    if (ruleMatches(rule, el)) Object.assign(out, rule.decls);
  }
  return out;
}

/** A plain class or tag selector — the only kind this cascade promises to resolve. */
export function isSimpleSelector(selector: string): boolean {
  return /^(\.[\w-]+|[a-zA-Z][\w-]*)$/.test(selector);
}
