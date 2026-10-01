// svgextract.ts — split model output into SVG blocks and map them back to the
// manifest. Matching is by explicit fence number, then by exact <title>; never
// by appearance, never shifted to fill gaps (batch spec §7/§8).

export interface ExtractedSvg {
  text: string;
  title: string | null;
  /** fence number when the block was ```lang N; 0 when absent */
  order: number;
}

export interface ManifestItem {
  position: number;
  name: string;
}

export type MatchIssue =
  | { kind: "duplicate"; position?: number; title?: string }
  | { kind: "missing"; position: number }
  | { kind: "unknown"; position?: number; title?: string };

const OPEN = /<svg(?=[\s>])/g;

/** Balanced <svg> roots; bare prose mentions without attributes are ignored. */
export function extractSvgs(raw: string): ExtractedSvg[] {
  const out: ExtractedSvg[] = [];
  const fences = fenceNumbers(raw);
  OPEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPEN.exec(raw))) {
    if (!hasAttrs(raw, m.index)) continue;
    const end = balanceFrom(raw, m.index);
    if (end < 0) continue;
    const text = raw.slice(m.index, end);
    out.push({ text, title: titleOf(text), order: fenceBefore(fences, m.index) });
    OPEN.lastIndex = end;
  }
  return out;
}

function hasAttrs(raw: string, at: number): boolean {
  const gt = raw.indexOf(">", at);
  return gt > 0 && raw.slice(at + 4, gt).trim().length > 0;
}

/** Index just past the matching </svg>, or -1 when unbalanced. */
export function balanceFrom(raw: string, at: number): number {
  let depth = 0;
  let i = at;
  while (i < raw.length) {
    const open = raw.indexOf("<svg", i);
    const close = raw.indexOf("</svg>", i);
    if (close < 0) return -1;
    if (open >= 0 && open < close) {
      if (hasAttrs(raw, open)) depth++;
      i = open + 4;
    } else {
      depth--;
      if (depth === 0) return close + 6;
      i = close + 6;
    }
  }
  return -1;
}

function titleOf(text: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/.exec(text);
  const t = m?.[1]?.trim();
  return t ? t : null;
}

function fenceNumbers(raw: string): { at: number; n: number }[] {
  const out: { at: number; n: number }[] = [];
  const re = /```[\w-]*[ \t]+(\d+)[ \t]*\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.push({ at: m.index, n: Number(m[1]) });
  return out;
}

function fenceBefore(fences: { at: number; n: number }[], at: number): number {
  let n = 0;
  for (const f of fences) if (f.at < at) n = f.n;
  return n;
}

export interface MatchOut {
  byPosition: Map<number, string>;
  issues: MatchIssue[];
}

interface MatchCtx {
  byPosition: Map<number, string>;
  issues: MatchIssue[];
  dupTitle: Set<string>;
  dupNumber: Set<number>;
}

interface MatchTables {
  positions: Set<number>;
  nameToPos: Map<string, number>;
  titleCount: Map<string, number>;
  numberCount: Map<number, number>;
}

export function matchSvgs(items: ManifestItem[], svgs: ExtractedSvg[]): MatchOut {
  const ctx: MatchCtx = { byPosition: new Map(), issues: [], dupTitle: new Set(), dupNumber: new Set() };
  const tables: MatchTables = {
    positions: new Set(items.map((i) => i.position)),
    nameToPos: new Map(items.map((i) => [i.name.trim().toLowerCase(), i.position])),
    titleCount: countBy(svgs.map((s) => s.title?.trim().toLowerCase() ?? null).filter((t): t is string => t !== null)),
    numberCount: countBy(svgs.filter((s) => s.order > 0).map((s) => s.order)),
  };
  for (const s of svgs) place(s, ctx, tables);
  for (const i of items) if (!ctx.byPosition.has(i.position)) ctx.issues.push({ kind: "missing", position: i.position });
  return { byPosition: ctx.byPosition, issues: ctx.issues };
}

function place(s: ExtractedSvg, ctx: MatchCtx, t: MatchTables): void {
  if (s.order > 0) { placeNumbered(s, ctx, t); return; }
  placeTitled(s, ctx, t);
}

function placeTitled(s: ExtractedSvg, ctx: MatchCtx, t: MatchTables): void {
  const key = s.title?.trim().toLowerCase() ?? null;
  if (key === null) { ctx.issues.push({ kind: "unknown" }); return; }
  if ((t.titleCount.get(key) ?? 0) > 1) {
    if (!ctx.dupTitle.has(key)) ctx.issues.push({ kind: "duplicate", title: s.title ?? undefined });
    ctx.dupTitle.add(key);
    return;
  }
  const pos = t.nameToPos.get(key);
  if (pos === undefined) ctx.issues.push({ kind: "unknown", title: s.title ?? undefined });
  else ctx.byPosition.set(pos, s.text);
}

function placeNumbered(s: ExtractedSvg, ctx: MatchCtx, t: MatchTables): void {
  if (!t.positions.has(s.order)) { ctx.issues.push({ kind: "unknown", position: s.order, title: s.title ?? undefined }); return; }
  if ((t.numberCount.get(s.order) ?? 0) > 1) {
    if (!ctx.dupNumber.has(s.order)) ctx.issues.push({ kind: "duplicate", position: s.order });
    ctx.dupNumber.add(s.order);
    return;
  }
  ctx.byPosition.set(s.order, s.text);
}

function countBy<T extends string | number>(keys: T[]): Map<T, number> {
  const out = new Map<T, number>();
  for (const k of keys) out.set(k, (out.get(k) ?? 0) + 1);
  return out;
}
