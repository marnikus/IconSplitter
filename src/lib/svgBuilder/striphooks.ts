// striphooks.ts — the composer's `data-*` hooks out of a delivered document
// (2026-11-23, RULE 26). The composed sheet marks every cell, caption and
// banner run with `data-*` so the editor can find it again; those attributes are
// editor bookkeeping, never part of the picture, so NO exported file carries
// them — not the clean-pass copy, not the "ship as before" one either.
const HOOK = /^data-/;

/** The same document without a single `data-*` attribute (input string untouched). */
export function stripPreviewHooks(svg: string): string {
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  if (root === null || root.getElementsByTagName("parsererror").length > 0) return svg;
  for (const el of [root, ...Array.from(root.getElementsByTagName("*"))]) {
    for (const attribute of Array.from(el.attributes)) {
      if (HOOK.test(attribute.name)) el.removeAttribute(attribute.name);
    }
  }
  return new XMLSerializer().serializeToString(root);
}
