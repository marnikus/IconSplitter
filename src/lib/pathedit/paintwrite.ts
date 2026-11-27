// paintwrite.ts — the session's fills written into the file (2026-11-27): a
// recoloured shape gets its `fill`, a shape whose line was expanded or dropped
// gets `stroke="none"`, a shape whose areas changed gets its `fill-rule` (each
// in its `style` too, when that or a class could overrule the attribute); a
// shape the session added becomes a new `<path fill=… stroke="none">` directly
// under the root <svg>, right after the top-level element holding the shape it
// sits above — or before the first drawn one when it sits under everything.
// Nothing else in the file changes.

import type { PathModel } from "./model";
import { blanked, cachedPathTags } from "./svgdoc";

interface Edit { start: number; end: number; text: string; seq: number }
interface Span { start: number; end: number }

const ANY_TAG = /<(\/?)([a-zA-Z][\w:.-]*)([^>]*)>/g;

/** For each drawn shape: the span of the root's child element that holds it (or is it). */
function topSpans(markup: string): Span[] {
  const tags = cachedPathTags(markup);
  const text = blanked(markup);
  const out: Span[] = [];
  let depth = 0, next = 0, top: Span | null = null;
  ANY_TAG.lastIndex = 0;
  for (let m = ANY_TAG.exec(text); m !== null; m = ANY_TAG.exec(text)) {
    const end = m.index + m[0].length;
    if (m[1] === "/") { depth -= 1; if (depth === 1 && top !== null) top.end = end; continue; }
    if (depth === 1) top = { start: m.index, end };
    if (next < tags.length && m.index === tags[next].start && top !== null) { out[next] = top; next += 1; }
    if (!/\/\s*$/.test(m[3])) depth += 1;
  }
  return out;
}

const TAG_NAME = /^<([\w:.-]+)/;

/** The start tag's `style` carrying the property, when a style or a class could overrule the attribute. */
function withStyleProp(tag: string, name: string, value: string): string {
  const inStyle = new RegExp(`(\\sstyle\\s*=\\s*"[^"]*?)(?<![\\w-])${name}\\s*:[^;"]*`, "i");
  if (inStyle.test(tag)) return tag.replace(inStyle, `$1${name}:${value}`);
  if (!/\sclass\s*=/.test(tag)) return tag;
  return /\sstyle\s*=\s*"/.test(tag) ? tag.replace(/(\sstyle\s*=\s*")/, `$1${name}:${value};`) : tag.replace(TAG_NAME, `<$1 style="${name}:${value}"`);
}

/** A start tag with one presentation property set. */
function withProp(tag: string, name: string, value: string): string {
  const out = withStyleProp(tag, name, value);
  const attr = new RegExp(`\\s${name}\\s*=\\s*("[^"]*"|'[^']*')`);
  return attr.test(out) ? out.replace(attr, ` ${name}="${value}"`) : out.replace(TAG_NAME, `<$1 ${name}="${value}"`);
}

/** What the session set on each existing object: property name → value. */
function propsByObject(m: PathModel): Map<number, [string, string][]> {
  const out = new Map<number, [string, string][]>();
  const put = (o: number, name: string, value: string) => out.set(o, [...(out.get(o) ?? []), [name, value]]);
  for (const [o, color] of Object.entries(m.paint ?? {})) put(Number(o), "fill", color);
  for (const [o, rule] of Object.entries(m.rules ?? {})) put(Number(o), "fill-rule", rule);
  for (const o of new Set(m.nostroke ?? [])) put(o, "stroke", "none");
  return out;
}

function addedTag(m: PathModel, owner: number, d: string): string {
  const evenodd = m.subs.some((s) => s.owner === owner && s.fillRule === "evenodd");
  return `<path d="${d}" fill="${m.paint?.[owner] ?? "#000000"}"${evenodd ? ' fill-rule="evenodd"' : ""} stroke="none"/>`;
}

/** The changed shapes' start tags, as edits. */
function tagEdits(markup: string, m: PathModel, order: readonly number[]): Edit[] {
  const tags = cachedPathTags(markup);
  return [...propsByObject(m)].flatMap(([o, props]) => {
    const t = tags[order.indexOf(o)];
    if (t === undefined) return [];
    const text = props.reduce((tag, [name, value]) => withProp(tag, name, value), markup.slice(t.start, t.end));
    return [{ start: t.start, end: t.end, text, seq: 0 }];
  });
}

/** The added shapes, as inserts under the root. */
function addEdits(markup: string, m: PathModel, order: readonly number[], dOf: (owner: number) => string): Edit[] {
  const spans = topSpans(markup);
  const bottom = spans[0]?.start ?? markup.search(/<\/svg\s*>\s*$/i);
  return (m.adds ?? []).flatMap((a, seq) => {
    const d = dOf(a.owner);
    const at = a.above === null ? bottom : spans[order.indexOf(a.above)]?.end ?? bottom;
    return d === "" || at < 0 ? [] : [{ start: at, end: at, text: addedTag(m, a.owner, d), seq: seq + 1 }];
  });
}

/**
 * `markup` (already redrawn and reordered) with the model's fills. `order[k]`
 * is the object standing in the file's slot k; `dOf` gives an added object's
 * path data in the root's units.
 */
export function withPaint(markup: string, m: PathModel, order: readonly number[], dOf: (owner: number) => string): string {
  const edits = [...tagEdits(markup, m, order), ...addEdits(markup, m, order, dOf)];
  if (edits.length === 0) return markup;
  // back to front; at one place a tag is rewritten before anything is put in front of it, and the
  // later-added shape is written first, so it ends up after (above) the earlier one
  edits.sort((x, y) => y.start - x.start || (y.end - y.start) - (x.end - x.start) || y.seq - x.seq);
  let out = markup;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}
