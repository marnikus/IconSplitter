// User-template paint CSS: shared grammar, class specificity, source order, then inline paint.
import { matchesPaintSelector, parsePaintStylesheet } from "./cleandom";

type PaintRule = NonNullable<ReturnType<typeof parsePaintStylesheet>>[number];

/** Fold the documented simple selectors without reversing CSS precedence. */
export function foldBadgeStylesheets(root: Element): string | null {
  const blocks = Array.from(root.querySelectorAll("style"));
  const rules: PaintRule[] = [];
  for (const block of blocks) {
    const parsed = parsePaintStylesheet(block.textContent ?? "");
    if (parsed === null) return "Unsupported stylesheet; use simple paint-only class/tag rules or inline SVG paint attributes.";
    rules.push(...parsed);
  }
  // Stable sort retains document order within a specificity tier (single class > single tag).
  rules.sort((a, b) => Number(a.selector.cls !== undefined) - Number(b.selector.cls !== undefined));
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const rule of rules) {
    for (const el of elements) {
      if (matchesPaintSelector(el, rule.selector)) {
        for (const [name, value] of rule.props) el.setAttribute(name, value);
      }
    }
  }
  for (const block of blocks) block.remove();
  return null;
}
