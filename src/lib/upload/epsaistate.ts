// epsaistate.ts — strict table-driven stack & block interpreter for native
// Adobe Illustrator 9–30.x editing streams (`%AI9_DataStream`), calibrated
// against real `Adobe Illustrator(R) 30.8.2` (`icon-award-ribbon_8_02.eps`).

import { lexAiLine, type AiVal } from "./epsailex";

export interface AiStopInfo { offset: number; opacity: number; color: [number, number, number] }
export interface AiGradientInfo { name: string; kind: "linear" | "radial"; stops: AiStopInfo[] }

export interface AiObjectInfo {
  kind: "path" | "compound"; subpaths: number; opacity: number; evenOdd: boolean;
  fillKind: "none" | "solid" | "gradient"; gradientName: string | null;
  xm: [number, number, number, number, number, number] | null;
  aspect: number | null; focalOffset: [number, number] | null;
  hasStroke: boolean; strokeWidthPt: number | null; closedFlags: boolean[];
}

interface GradBuild {
  name: string; kind: "linear" | "radial"; expected: number;
  arrays: number; brCount: number; bsUpper: number; stops: AiStopInfo[];
}
interface PendingGrad {
  name: string | null; xm: [number, number, number, number, number, number] | null;
  aspect: number | null; focal: [number, number] | null;
}

interface AiVm {
  stack: AiVal[]; openArr: AiVal[][] | null; inNonPrinting: boolean; inGradBlock: boolean;
  dictDepth: number; inLayer: boolean; inCompound: boolean; hasPath: boolean;
  inBb: PendingGrad | null; gradBuild: GradBuild | null; opacity: number; evenOdd: boolean;
  strokeWidth: number; curSubs: AiObjectInfo | null;
  gradients: Map<string, AiGradientInfo>; objects: AiObjectInfo[]; errors: string[];
}

type OpHandler = (lineNo: number, vm: AiVm) => void;

const SIMPLE_NUM_OPS: Record<string, number> = {
  A: 1, Xw: 1, O: 1, R: 1, J: 1, j: 1, M: 1, D: 1, Bn: 1, Lb: 14, Bc: 6, Bm: 6, Xa: 7, XA: 7,
};
const NOOP_OPS = new Set(["Np", "u", "U", "q", "Q", "W"]);
const PATH_SEG_ARITY: Record<string, number> = { l: 2, L: 2, c: 6, C: 6, v: 4, V: 4, y: 4, Y: 4 };

const HANDLERS: Record<string, OpHandler> = {
  ":": (_n, vm) => { vm.stack.pop(); vm.dictDepth++; },
  XW: (_n, vm) => { vm.stack.pop(); vm.stack.pop(); },
  LB: (n, vm) => { if (!vm.inLayer) vm.errors.push(`line ${n}: LB outside layer`); vm.inLayer = false; },
  Ln: (n, vm) => { if (vm.stack.pop()?.kind !== "str") vm.errors.push(`line ${n}: Ln expects string`); },
  Xy: (n, vm) => { const v = popNums(vm, 5, "Xy", n); if (v !== null) vm.opacity = v[1]; },
  XR: (n, vm) => { const v = popNums(vm, 1, "XR", n); if (v !== null) vm.evenOdd = v[0] === 1; },
  w: (n, vm) => { const v = popNums(vm, 1, "w", n); if (v !== null) vm.strokeWidth = v[0]; },
  d: opDash, Bd: beginGradDef, Br: pushGradRampSeg, BS: pushLegacyGradStop, Bs: pushGradStop, BD: endGradDef,
  "*u": (n, vm) => { if (vm.inCompound) vm.errors.push(`line ${n}: nested *u`); vm.inCompound = true; vm.curSubs = null; },
  "*U": finishCompound, m: opMoveTo,
  Bb: (_n, vm) => { vm.inBb = { name: null, xm: null, aspect: null, focal: null }; },
  Bh: (n, vm) => { const v = popNums(vm, 4, "Bh", n); if (v !== null && vm.inBb !== null) vm.inBb.focal = [v[0], v[1]]; },
  Bg: parseBgOp,
  Xm: (n, vm) => {
    const v = popNums(vm, 6, "Xm", n);
    if (v !== null && vm.inBb !== null) vm.inBb.xm = v as [number, number, number, number, number, number];
  },
  BB: finishBbOp,
};

export function runAiStreamCheck(stream: string): { errors: string[]; gradients: AiGradientInfo[]; objects: AiObjectInfo[] } {
  const vm = createVm();
  const lines = sliceProgramBody(stream, vm.errors).split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length && vm.errors.length === 0; i++) execAiLine(lines[i], i + 1, vm);
  if (vm.errors.length === 0) finishAiVm(vm);
  return { errors: vm.errors, gradients: [...vm.gradients.values()], objects: vm.objects };
}

function createVm(): AiVm {
  return {
    stack: [], openArr: null, inNonPrinting: false, inGradBlock: false, dictDepth: 0,
    inLayer: false, inCompound: false, hasPath: false, inBb: null, gradBuild: null,
    opacity: 1, evenOdd: false, strokeWidth: 1, curSubs: null, gradients: new Map(), objects: [], errors: [],
  };
}

function sliceProgramBody(stream: string, errors: string[]): string {
  const setup = stream.indexOf("%%BeginSetup");
  const trailer = stream.indexOf("%%PageTrailer");
  if (setup >= 0 && trailer > setup) return stream.slice(setup, trailer);
  errors.push("AI stream missing %%BeginSetup or %%PageTrailer");
  return "";
}

function finishAiVm(vm: AiVm): void {
  const bad = [
    [vm.hasPath, "AI stream ended with unpainted path"],
    [vm.inCompound, "AI stream ended with unclosed compound path (*u)"],
    [vm.inLayer, "AI stream ended with unclosed layer (LB)"],
    [vm.gradBuild !== null, "AI stream ended inside gradient definition"],
    [vm.inBb !== null, "AI stream ended inside gradient instance (Bb)"],
    [vm.stack.length > 0, `AI stream left ${vm.stack.length} operand(s) on stack`],
  ] as const;
  for (const [cond, msg] of bad) if (cond) vm.errors.push(msg);
}

function execAiLine(raw: string, lineNo: number, vm: AiVm): void {
  const trimmed = raw.trim();
  if (trimmed === "" || (trimmed.startsWith("%") && !trimmed.startsWith("%_"))) {
    trackCommentMarker(trimmed, vm);
    return;
  }
  if (vm.inNonPrinting && !vm.inGradBlock && !/^\d+\s+Bn$/.test(trimmed)) return;
  for (const tok of lexAiLine(trimmed.startsWith("%_") ? trimmed.slice(2) : trimmed, lineNo, vm.errors)) {
    if (vm.errors.length > 0) return;
    stepToken(tok, lineNo, vm);
  }
}

function trackCommentMarker(trimmed: string, vm: AiVm): void {
  if (trimmed === "%AI5_BeginLayer") vm.inLayer = true;
  else if (trimmed === "%AI5_Begin_NonPrinting" || trimmed === "%AI5_BeginPalette") vm.inNonPrinting = true;
  else if (trimmed.startsWith("%AI5_End_NonPrinting") || trimmed === "%AI5_EndPalette") vm.inNonPrinting = false;
  else if (trimmed.startsWith("%AI5_BeginGradient:")) vm.inGradBlock = true;
  else if (trimmed === "%AI5_EndGradient") vm.inGradBlock = false;
}

function stepToken(tok: AiVal, lineNo: number, vm: AiVm): void {
  if (vm.dictDepth > 0) {
    if (tok.kind === "str" && tok.s === "\0:") vm.dictDepth++;
    else if (tok.kind === "str" && tok.s === "\0;") vm.dictDepth--;
    return;
  }
  if (tok.kind !== "str" || !tok.s.startsWith("\0")) { pushAi(vm, tok); return; }
  const op = tok.s.slice(1);
  if (op === "[" || op === "]") { stepBracket(op, lineNo, vm); return; }
  dispatchAiOp(op, lineNo, vm);
}

function stepBracket(op: "[" | "]", lineNo: number, vm: AiVm): void {
  if (op === "[") {
    if (vm.gradBuild !== null) {
      if (vm.stack.length > 0) vm.errors.push(`line ${lineNo}: orphan stack operand before [ in gradient`);
      vm.gradBuild.arrays++;
      return;
    }
    vm.openArr = [...(vm.openArr ?? []), []];
    return;
  }
  const top = vm.openArr?.pop();
  if (top === undefined) { vm.errors.push(`line ${lineNo}: unmatched ]`); return; }
  if (vm.openArr?.length === 0) vm.openArr = null;
  pushAi(vm, { kind: "arr", items: top });
}

function dispatchAiOp(op: string, lineNo: number, vm: AiVm): void {
  if (op.startsWith("/")) { pushAi(vm, { kind: "str", s: op }); return; }
  if (op in SIMPLE_NUM_OPS) { popNums(vm, SIMPLE_NUM_OPS[op], op, lineNo); return; }
  if (NOOP_OPS.has(op)) return;
  if (op in PATH_SEG_ARITY) { requirePath(op, lineNo, vm); popNums(vm, PATH_SEG_ARITY[op], op, lineNo); return; }
  if (/^[fFsSbBnNhH]$/.test(op)) { paintSubpath(op, lineNo, vm); return; }
  const fn = HANDLERS[op];
  if (fn !== undefined) { fn(lineNo, vm); return; }
  vm.errors.push(`line ${lineNo}: unknown AI operator ${op}`);
}

function pushAi(vm: AiVm, v: AiVal): void {
  if (vm.openArr !== null) vm.openArr[vm.openArr.length - 1].push(v);
  else vm.stack.push(v);
}

function popNums(vm: AiVm, n: number, op: string, lineNo: number): number[] | null {
  if (vm.stack.length < n) { vm.errors.push(`line ${lineNo}: ${op} expects ${n} operands, found ${vm.stack.length}`); return null; }
  const items = vm.stack.splice(vm.stack.length - n, n);
  if (items.some((v) => v.kind !== "num")) { vm.errors.push(`line ${lineNo}: ${op} expects numeric operands`); return null; }
  return items.map((v) => (v as { kind: "num"; n: number }).n);
}

function opDash(lineNo: number, vm: AiVm): void {
  const phase = vm.stack.pop();
  const arr = vm.stack.pop();
  if (phase?.kind !== "num" || arr?.kind !== "arr") vm.errors.push(`line ${lineNo}: d expects [array] phase`);
}

function opMoveTo(lineNo: number, vm: AiVm): void {
  if (vm.hasPath) vm.errors.push(`line ${lineNo}: m before previous path painted`);
  popNums(vm, 2, "m", lineNo);
  vm.hasPath = true;
}

function beginGradDef(lineNo: number, vm: AiVm): void {
  const nums = popNums(vm, 2, "Bd", lineNo);
  const name = vm.stack.pop();
  if (nums === null || name?.kind !== "str") { vm.errors.push(`line ${lineNo}: invalid Bd header`); return; }
  vm.gradBuild = { name: name.s, kind: nums[0] === 1 ? "radial" : "linear", expected: nums[1], arrays: 0, brCount: 0, bsUpper: 0, stops: [] };
}

function pushGradRampSeg(lineNo: number, vm: AiVm): void {
  if (vm.gradBuild === null || vm.gradBuild.arrays !== 1) { vm.errors.push(`line ${lineNo}: Br outside ramp array`); return; }
  if (popNums(vm, 8, "Br", lineNo) !== null) vm.gradBuild.brCount++;
}

function pushLegacyGradStop(lineNo: number, vm: AiVm): void {
  if (vm.gradBuild === null || vm.gradBuild.arrays !== 2) { vm.errors.push(`line ${lineNo}: BS outside stop array`); return; }
  if (popNums(vm, 12, "BS", lineNo) !== null) vm.gradBuild.bsUpper++;
}

function pushGradStop(lineNo: number, vm: AiVm): void {
  if (vm.gradBuild === null || vm.gradBuild.arrays !== 2) { vm.errors.push(`line ${lineNo}: Bs outside stop array`); return; }
  const n = popNums(vm, 12, "Bs", lineNo);
  if (n === null) return;
  if (n[7] !== 2 || n[9] !== 6) { vm.errors.push(`line ${lineNo}: Bs expected RGB+opacity style (2, 6)`); return; }
  vm.gradBuild.stops.push({ offset: n[11] / 100, opacity: n[8], color: [n[4], n[5], n[6]] });
}

function endGradDef(lineNo: number, vm: AiVm): void {
  const g = vm.gradBuild;
  if (g === null) { vm.errors.push(`line ${lineNo}: unexpected BD`); return; }
  if (vm.stack.length > 0) vm.errors.push(`line ${lineNo}: orphan operands left on stack before BD`);
  if (g.brCount !== g.expected - 1 || g.bsUpper !== g.expected || g.stops.length !== g.expected) {
    vm.errors.push(`line ${lineNo}: gradient (${g.name}) incomplete Br/BS/Bs ramp table`);
  }
  vm.gradients.set(g.name, { name: g.name, kind: g.kind, stops: [...g.stops].sort((a, b) => a.offset - b.offset) });
  vm.gradBuild = null;
}

function parseBgOp(lineNo: number, vm: AiVm): void {
  if (vm.stack.length < 13) { vm.errors.push(`line ${lineNo}: Bg expects 13 operands, found ${vm.stack.length}`); vm.stack.length = 0; return; }
  const tail = popNums(vm, 11, "Bg", lineNo);
  const name = vm.stack.pop();
  const flag = popNums(vm, 1, "Bg", lineNo);
  if (tail === null || flag === null || name?.kind !== "str") { vm.errors.push(`line ${lineNo}: invalid Bg operands`); return; }
  if (!vm.gradients.has(name.s)) vm.errors.push(`line ${lineNo}: Bg references undefined gradient (${name.s})`);
  if (vm.inBb !== null) { vm.inBb.name = name.s; vm.inBb.aspect = tail[10]; }
}

function finishBbOp(lineNo: number, vm: AiVm): void {
  const n = popNums(vm, 1, "BB", lineNo);
  if (vm.inBb === null) vm.errors.push(`line ${lineNo}: BB without Bb`);
  if (n !== null && n[0] > 0 && vm.curSubs !== null) { vm.curSubs.hasStroke = true; vm.curSubs.strokeWidthPt = vm.strokeWidth; }
  vm.inBb = null;
}

function paintSubpath(op: string, lineNo: number, vm: AiVm): void {
  if (!requirePath(op, lineNo, vm)) return;
  vm.hasPath = false;
  const obj = ensureObject(vm, vm.inBb !== null || "fFbB".includes(op), "sSbB".includes(op));
  obj.subpaths++;
  obj.closedFlags.push(op === op.toLowerCase());
}

function ensureObject(vm: AiVm, hasFill: boolean, hasStroke: boolean): AiObjectInfo {
  if (vm.inCompound && vm.curSubs !== null) return vm.curSubs;
  const info = buildObjectInfo(vm, hasFill, hasStroke);
  if (vm.inCompound) vm.curSubs = info;
  else vm.objects.push(info);
  return info;
}

function fillInfoOf(g: PendingGrad | null, hasFill: boolean) {
  if (g !== null) return { fillKind: "gradient" as const, gradientName: g.name, xm: g.xm, aspect: g.aspect, focalOffset: g.focal };
  return { fillKind: hasFill ? "solid" as const : "none" as const, gradientName: null, xm: null, aspect: null, focalOffset: null };
}

function buildObjectInfo(vm: AiVm, hasFill: boolean, hasStroke: boolean): AiObjectInfo {
  return {
    kind: vm.inCompound ? "compound" : "path", subpaths: 0, opacity: vm.opacity, evenOdd: vm.evenOdd,
    ...fillInfoOf(vm.inBb, hasFill), hasStroke, strokeWidthPt: hasStroke ? vm.strokeWidth : null, closedFlags: [],
  };
}

function finishCompound(lineNo: number, vm: AiVm): void {
  if (!vm.inCompound) { vm.errors.push(`line ${lineNo}: *U without *u`); return; }
  if (vm.hasPath || vm.curSubs === null) vm.errors.push(`line ${lineNo}: unpainted or empty *u compound path`);
  else vm.objects.push(vm.curSubs);
  vm.inCompound = false;
  vm.curSubs = null;
}

function requirePath(op: string, lineNo: number, vm: AiVm): boolean {
  if (!vm.hasPath) { vm.errors.push(`line ${lineNo}: ${op} without current point`); return false; }
  return true;
}
