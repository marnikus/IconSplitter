// svgdirectpath.ts — spec-exact SVG 1.1 §8.3.9 path scanner (including compact
// SVGO arc flags) and zero-drift uniform scale/translate + 1-decimal formatter
// (RULE 26). Every emitted path number has at most 1 decimal place (trailing .0
// stripped) while relative chains track exact vs rounded cursors for zero drift.

export interface DirectTransform {
  scale?: number;
  dx?: number;
  dy?: number;
}

export interface PathCmd {
  cmd: string;
  args: number[];
}

interface PathCursor {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  sx: number;
  sy: number;
  started: boolean;
}

const CMD_ARITY: Record<string, number> = {
  M: 2, m: 2, L: 2, l: 2, H: 1, h: 1, V: 1, v: 1,
  C: 6, c: 6, S: 4, s: 4, Q: 4, q: 4, T: 2, t: 2, A: 7, a: 7, Z: 0, z: 0,
};

const NUM_RE = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

/** Rounds to at most 1 decimal place; positive values honour `minPositive` when > 0. */
export function round1(value: number, minPositive = 0): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10) / 10;
  if (minPositive > 0 && value > 0 && rounded < minPositive) return minPositive;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/** Formats a number to at most 1 decimal place with trailing `.0` stripped. */
export function fmt1(value: number, minPositive = 0): string {
  return String(round1(value, minPositive));
}

function skipSep(d: string, index: number): number {
  let i = index;
  while (i < d.length) {
    const ch = d.charCodeAt(i);
    if (ch === 32 || ch === 9 || ch === 10 || ch === 13 || ch === 44) i++;
    else break;
  }
  return i;
}

function readArcFlag(d: string, index: number): [number, number] | null {
  const ch = d[index];
  if (ch === "0" || ch === "1") return [ch === "1" ? 1 : 0, index + 1];
  return null;
}

function readNumber(d: string, index: number): [number, number] | null {
  NUM_RE.lastIndex = index;
  const match = NUM_RE.exec(d);
  if (!match) return null;
  return [Number(match[0]), NUM_RE.lastIndex];
}

function scanArgs(d: string, start: number, cmd: string, arity: number): [number[], number] {
  const args: number[] = [];
  const isArc = cmd === "A" || cmd === "a";
  let i = skipSep(d, start);
  while (i < d.length) {
    const slot = arity > 0 ? args.length % arity : -1;
    const hit = isArc && (slot === 3 || slot === 4) ? readArcFlag(d, i) : readNumber(d, i);
    if (!hit) break;
    args.push(hit[0]);
    i = skipSep(d, hit[1]);
  }
  return [args, i];
}

export function scanPathCommands(d: string): PathCmd[] {
  const out: PathCmd[] = [];
  let i = skipSep(d, 0);
  while (i < d.length) {
    const cmd = d[i];
    const arity = CMD_ARITY[cmd];
    if (arity === undefined) break;
    const [args, next] = arity === 0 ? [[], skipSep(d, i + 1)] : scanArgs(d, i + 1, cmd, arity);
    out.push({ cmd, args });
    i = next;
  }
  return out;
}

function moveCursorAbs(cur: PathCursor, tx: number, ty: number, markStart = false): string {
  cur.cx = tx;
  cur.cy = ty;
  cur.rx = round1(tx);
  cur.ry = round1(ty);
  if (markStart) { cur.sx = tx; cur.sy = ty; }
  cur.started = true;
  return `${cur.rx} ${cur.ry}`;
}

function moveCursorRel(cur: PathCursor, dxScaled: number, dyScaled: number, markStart = false): string {
  const tx = cur.cx + dxScaled;
  const ty = cur.cy + dyScaled;
  const nx = round1(tx);
  const ny = round1(ty);
  const stepX = round1(nx - cur.rx);
  const stepY = round1(ny - cur.ry);
  cur.cx = tx;
  cur.cy = ty;
  cur.rx = nx;
  cur.ry = ny;
  if (markStart) { cur.sx = tx; cur.sy = ty; }
  cur.started = true;
  return `${stepX} ${stepY}`;
}

function relControl(cur: PathCursor, ux: number, uy: number, s: number): string {
  const tx = round1(cur.cx + s * ux);
  const ty = round1(cur.cy + s * uy);
  return `${round1(tx - cur.rx)} ${round1(ty - cur.ry)}`;
}

function absPoint(x: number, y: number, s: number, o: [number, number]): string {
  return `${fmt1(o[0] + s * x)} ${fmt1(o[1] + s * y)}`;
}

function emitMove(cmd: string, args: number[], cur: PathCursor, xform: [number, number, number]): string {
  const [s, dx, dy] = xform;
  const parts: string[] = [];
  for (let i = 0; i + 1 < args.length; i += 2) {
    if (i === 0) {
      const firstAbs = cmd === "M" || !cur.started;
      const pt = firstAbs
        ? moveCursorAbs(cur, dx + s * args[0], dy + s * args[1], true)
        : moveCursorRel(cur, s * args[0], s * args[1], true);
      parts.push(`${firstAbs ? "M" : "m"}${pt}`);
    } else {
      const sub = cmd === "M"
        ? `L${moveCursorAbs(cur, dx + s * args[i], dy + s * args[i + 1])}`
        : `l${moveCursorRel(cur, s * args[i], s * args[i + 1])}`;
      parts.push(sub);
    }
  }
  return parts.join("");
}

function emitAxis(cmd: string, args: number[], cur: PathCursor, xform: [number, number, number]): string {
  const [s, dx, dy] = xform;
  const vals: string[] = [];
  for (const v of args) {
    if (cmd === "H") { cur.cx = dx + s * v; cur.rx = round1(cur.cx); vals.push(String(cur.rx)); }
    else if (cmd === "V") { cur.cy = dy + s * v; cur.ry = round1(cur.cy); vals.push(String(cur.ry)); }
    else if (cmd === "h") {
      const nx = round1(cur.cx + s * v);
      vals.push(String(round1(nx - cur.rx)));
      cur.cx += s * v; cur.rx = nx;
    } else {
      const ny = round1(cur.cy + s * v);
      vals.push(String(round1(ny - cur.ry)));
      cur.cy += s * v; cur.ry = ny;
    }
  }
  return `${cmd}${vals.join(" ")}`;
}

function emitTuplePairs(cmd: string, args: number[], cur: PathCursor, xform: [number, number, number]): string {
  const [s, dx, dy] = xform;
  const arity = CMD_ARITY[cmd];
  const isRel = cmd === cmd.toLowerCase();
  const o: [number, number] = [dx, dy];
  const segs: string[] = [];
  for (let i = 0; i + arity <= args.length; i += arity) {
    const controls: string[] = [];
    for (let j = 0; j < arity - 2; j += 2) {
      controls.push(isRel ? relControl(cur, args[i + j], args[i + j + 1], s) : absPoint(args[i + j], args[i + j + 1], s, o));
    }
    const end = isRel
      ? moveCursorRel(cur, s * args[i + arity - 2], s * args[i + arity - 1])
      : moveCursorAbs(cur, dx + s * args[i + arity - 2], dy + s * args[i + arity - 1]);
    segs.push([...controls, end].join(" "));
  }
  return `${cmd}${segs.join(" ")}`;
}

function emitArc(cmd: string, args: number[], cur: PathCursor, xform: [number, number, number]): string {
  const [s, dx, dy] = xform;
  const isRel = cmd === "a";
  const segs: string[] = [];
  for (let i = 0; i + 7 <= args.length; i += 7) {
    const rx = Math.abs(args[i]) > 0 ? fmt1(Math.abs(s * args[i]), 0.1) : "0";
    const ry = Math.abs(args[i + 1]) > 0 ? fmt1(Math.abs(s * args[i + 1]), 0.1) : "0";
    const rot = fmt1(args[i + 2]);
    const laf = args[i + 3] ? "1" : "0";
    const sf = args[i + 4] ? "1" : "0";
    const end = isRel
      ? moveCursorRel(cur, s * args[i + 5], s * args[i + 6])
      : moveCursorAbs(cur, dx + s * args[i + 5], dy + s * args[i + 6]);
    segs.push(`${rx} ${ry} ${rot} ${laf} ${sf} ${end}`);
  }
  return `${cmd}${segs.join(" ")}`;
}

const CMD_EMITTERS: Record<string, (cmd: string, args: number[], cur: PathCursor, xform: [number, number, number]) => string> = {
  M: emitMove, m: emitMove,
  H: emitAxis, h: emitAxis, V: emitAxis, v: emitAxis,
  A: emitArc, a: emitArc,
};

function emitCommand(item: PathCmd, cur: PathCursor, xform: [number, number, number]): string {
  const { cmd, args } = item;
  if (cmd === "Z" || cmd === "z") {
    cur.cx = cur.sx; cur.cy = cur.sy; cur.rx = round1(cur.sx); cur.ry = round1(cur.sy);
    return cmd;
  }
  if (args.length === 0) return "";
  const emitter = CMD_EMITTERS[cmd] ?? emitTuplePairs;
  return emitter(cmd, args, cur, xform);
}

/** Emits pre-scanned path commands directly in target coordinates rounded to ≤ 1 decimal. */
export function emitPathCommands(cmds: readonly PathCmd[], transform?: DirectTransform): string {
  if (cmds.length === 0) return "";
  const xform: [number, number, number] = [transform?.scale ?? 1, transform?.dx ?? 0, transform?.dy ?? 0];
  const cur: PathCursor = { cx: 0, cy: 0, rx: 0, ry: 0, sx: 0, sy: 0, started: false };
  let out = "";
  for (let i = 0; i < cmds.length; i++) out += emitCommand(cmds[i], cur, xform);
  return out;
}

/** Scales, translates and rounds an SVG `d` string directly to ≤ 1 decimal place. */
export function directPathData(d: string, transform?: DirectTransform): string {
  const trimmed = d.trim();
  if (!trimmed) return "";
  return emitPathCommands(scanPathCommands(trimmed), transform);
}
