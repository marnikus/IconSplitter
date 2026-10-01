import { balanceFrom } from "./svgextract";

// svgvalidate.ts — the gate between model output and anything the user sees
// (design D6). Unsafe or structurally broken SVG never validates; a wrong icon
// count warns without failing. Scanner-based, no DOM dependency (RULE 8).

export interface SvgValidation {
  ok: boolean;
  reasons: string[];
  warnings: string[];
  width: number | null;
  height: number | null;
  viewBox: string | null;
  /** top-level drawable clusters; the default prompt expects 4 */
  iconClusters: number;
}

export interface SanitizeOut {
  text: string;
  removed: string[];
}

const DRAWABLE = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "use"];

export function sanitizeSvg(text: string): SanitizeOut {
  const removed: string[] = [];
  let out = text;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, tag(removed, "script"));
  out = out.replace(/<script\b[^>]*\/?>/gi, tag(removed, "script"));
  out = out.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, tag(removed, "foreignObject"));
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, (hit) => {
    removed.push(hit.trim().split("=")[0]);
    return "";
  });
  out = out.replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, () => {
    removed.push("javascript:");
    return "";
  });
  return { text: out, removed };
}

function tag(removed: string[], label: string): () => string {
  return () => {
    removed.push(label);
    return "";
  };
}

export function validateSvg(raw: string): SvgValidation {
  const { text, removed } = sanitizeSvg(raw);
  const v: SvgValidation = { ok: false, reasons: [], warnings: [], width: null, height: null, viewBox: null, iconClusters: 0 };
  if (removed.length > 0) v.reasons.push(`unsafe content removed: ${[...new Set(removed)].join(", ")}`);

  const roots = rootSpans(text);
  if (roots.length !== 1) {
    v.reasons.push(roots.length === 0 ? "no svg root found" : `multiple svg roots (${roots.length})`);
    return v;
  }
  fillRoot(v, roots[0], text);
  v.ok = v.reasons.length === 0;
  return v;
}

function fillRoot(v: SvgValidation, root: RootSpan, text: string): void {
  v.viewBox = attr(root.open, "viewBox");
  v.width = numAttr(root.open, "width");
  v.height = numAttr(root.open, "height");
  if (!v.viewBox && v.width === null && v.height === null) v.reasons.push("no viewBox and no width/height");

  const inner = text.slice(root.openEnd, root.closeStart);
  if (!DRAWABLE.some((t) => new RegExp(`<${t}[\\s>]`, "i").test(inner))) v.reasons.push("no visible geometry");

  const prose = innerWithoutTags(inner);
  if (prose) v.warnings.push(`prose text inside the svg: "${prose.slice(0, 40)}"`);

  v.iconClusters = countClusters(inner);
  if (v.iconClusters !== 4) v.warnings.push(`expected 4 distinct icons, found ${v.iconClusters}`);
}

interface RootSpan { open: string; openEnd: number; closeStart: number }

function rootSpans(text: string): RootSpan[] {
  const out: RootSpan[] = [];
  const re = /<svg(?=[\s>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const gt = text.indexOf(">", m.index);
    if (gt < 0 || text.slice(m.index + 4, gt).trim().length === 0) continue;
    const end = balanceFrom(text, m.index);
    if (end >= 0) out.push({ open: text.slice(m.index, gt + 1), openEnd: gt + 1, closeStart: end - 6 });
    re.lastIndex = end >= 0 ? end : text.length;
  }
  return out;
}

function attr(open: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(open);
  return m ? m[1] : null;
}

function numAttr(open: string, name: string): number | null {
  const s = attr(open, name);
  if (s === null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function innerWithoutTags(inner: string): string {
  const noMeta = inner.replace(/<(title|desc)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  return noMeta.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function countClusters(inner: string): number {
  let n = 0;
  let depth = 0;
  const tokens = inner.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g);
  for (const t of tokens) {
    const [, close, tag] = t;
    if (close) { depth--; continue; }
    if (depth === 0 && isCluster(tag)) n++;
    if (!t[0].endsWith("/>") && !/^(br|img|stop)$/i.test(tag)) depth++;
  }
  return n;
}

function isCluster(tagName: string): boolean {
  return DRAWABLE.concat("g").some((d) => d.toLowerCase() === tagName.toLowerCase());
}
