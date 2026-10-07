// svgstyle.ts — reading one SVG property the way the renderer does (RULE 1/3).
// Owns ONE rule, and it is a rule that is easy to get wrong: an inline `style`
// declaration beats a presentation attribute (CSS cascade), and an attribute
// beats nothing. `transform="…"` is a presentation attribute too, so a `style`
// carrying `transform:` replaces it rather than adding to it.

/**
 * The effective value of `name` on `el`: the inline declaration when it exists,
 * otherwise the attribute, always trimmed and lower-cased. `css` names the
 * declaration when it differs from the attribute (they never do today, but the
 * call reads better at the call site).
 */
export function svgValue(el: Element, name: string, css: string = name): string {
  const inline = inlineDeclaration(el, css);
  if (inline !== "") return inline;
  return (el.getAttribute(name) ?? "").trim().toLowerCase();
}

/** The value of one declaration inside the element's inline `style`, or "". */
export function inlineDeclaration(el: Element, css: string): string {
  const style = el.getAttribute("style") ?? "";
  const match = new RegExp(`(?:^|;)\\s*${css.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}\\s*:\\s*([^;]+)`, "i").exec(style);
  return match ? match[1].trim().toLowerCase() : "";
}
