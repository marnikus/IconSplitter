// Unlike preview's tolerant transform parser, EPS must not silently drop syntax.
import { parseTransform, type Matrix } from "./geom/matrix";
import { Unsupported } from "./epspaint";
import { psNumber } from "./epspsdata";

export function epsTransform(raw: string | null): Matrix {
  const text = raw ?? "";
  const rest = text.replace(/(\w+)\s*\(([^)]*)\)/g, (_full, op: string, args: string) => {
    checkOperation(op.toLowerCase(), args);
    return "";
  });
  if (rest.replace(/[\s,]/g, "") !== "") throw new Unsupported("unsupported EPS transform syntax");
  const m = parseTransform(text);
  if (!Object.values(m).every(Number.isFinite) || Math.abs(m.a * m.d - m.b * m.c) < 1e-12) throw new Unsupported("singular or non-finite EPS transform");
  return m;
}

export function matrixPs(m: Matrix): string {
  return `[${[m.a, m.b, m.c, m.d, m.e, m.f].map(psNumber).join(" ")}] concat`;
}

function checkOperation(op: string, args: string): void {
  const allowed: Record<string, number[]> = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewx: [1], skewy: [1] };
  const values = args.trim().split(/[\s,]+/).filter(Boolean);
  if (!allowed[op]?.includes(values.length)) throw new Unsupported("unsupported EPS transform operation");
  if (values.some((v) => !/^[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?$/i.test(v) || !Number.isFinite(Number(v)))) throw new Unsupported("invalid EPS transform number");
}
