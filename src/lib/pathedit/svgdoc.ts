// svgdoc.ts — the icon file around the edited path (2026-11-06). The editor
// changes ONE `<path>`'s `d` and nothing else: viewBox, fill, stroke,
// stroke-width, every other element and every other character of the file
// stay as they were. Paths are found by their tags in the source text
// (comments and CDATA skipped), numbered in document order; the preview copy
// carries that number as `data-edit-path` so a click picks the right one. Pure.

export interface PathTag { index: number; start: number; end: number; d: string | null }

const D_ATTR = /\sd\s*=\s*("([^"]*)"|'([^']*)')/;

/** Comments and CDATA blanked (same length) so a commented-out path is never counted. */
function blanked(markup: string): string {
  return markup.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => " ".repeat(m.length));
}

/** Every `<path>` start tag in document order, with its `d`. */
export function pathTags(markup: string): PathTag[] {
  const out: PathTag[] = [];
  const re = /<path\b[^>]*>/gi;
  const text = blanked(markup);
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const tag = markup.slice(m.index, m.index + m[0].length);
    const d = D_ATTR.exec(tag);
    out.push({ index: out.length, start: m.index, end: m.index + m[0].length, d: d === null ? null : (d[2] ?? d[3]) });
  }
  return out;
}

/** The file with path `index`'s `d` replaced (added when it had none); null when there is no such path. */
export function withPathD(markup: string, index: number, d: string): string | null {
  const tag = pathTags(markup)[index];
  if (tag === undefined) return null;
  const old = markup.slice(tag.start, tag.end);
  const next = D_ATTR.test(old) ? old.replace(D_ATTR, ` d="${d}"`) : old.replace(/^<path\b/i, `<path d="${d}"`);
  return markup.slice(0, tag.start) + next + markup.slice(tag.end);
}

/** The preview copy: each path tagged with its number, so a click names the path it hit. */
export function annotatePaths(markup: string): string {
  let out = markup;
  for (const tag of pathTags(markup).reverse()) {
    out = `${out.slice(0, tag.start)}<path data-edit-path="${tag.index}"${out.slice(tag.start + "<path".length)}`;
  }
  return out;
}
