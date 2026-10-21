// A closed PostScript DATA grammar: no procedures, strings, streams or execution.
import { Unsupported } from "./epspaint";

export type PsValue = number | boolean | string | PsValue[] | PsDict;
export interface PsDict { [key: string]: PsValue }
interface Reader { tokens: string[]; at: number; depth: number }

export function psNumber(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new Unsupported("EPS numeric range exceeded");
  return n.toFixed(9).replace(/\.?0+$/, "") || "0";
}

export function psData(value: PsValue): string {
  if (typeof value === "number") return psNumber(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string") return `/${value}`;
  if (Array.isArray(value)) return `[${value.map(psData).join(" ")}]`;
  return `<< ${Object.entries(value).map(([key, v]) => `/${key} ${psData(v)}`).join(" ")} >>`;
}

export function parsePsData(text: string): PsValue {
  if (text.length > 2_000_000) throw new Error("EPS shading data limit exceeded");
  const r: Reader = { tokens: text.match(/<<|>>|\[|\]|\/[^\s<>[\]]+|[<>]|[^\s<>[\]]+/g) ?? [], at: 0, depth: 0 };
  const value = readValue(r);
  if (r.at !== r.tokens.length) throw new Error("trailing shading data");
  return value;
}

function readValue(r: Reader): PsValue {
  if (++r.depth > 12) throw new Error("excessive shading nesting");
  const tok = r.tokens[r.at++];
  const value = readToken(tok, r);
  r.depth--;
  return value;
}

function readToken(tok: string, r: Reader): PsValue {
  if (tok === "<<") return readDict(r);
  if (tok === "[") return readArray(r);
  if (tok === "true" || tok === "false") return tok === "true";
  if (/^\/[A-Za-z][A-Za-z0-9]*$/.test(tok)) return tok.slice(1);
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(tok) && Number.isFinite(Number(tok))) return Number(tok);
  throw new Error("unsupported or raster-bearing shading data");
}

function readDict(r: Reader): PsDict {
  const out: PsDict = Object.create(null) as PsDict;
  while (r.tokens[r.at] !== ">>") {
    const name = r.tokens[r.at++];
    if (!/^\/[A-Za-z][A-Za-z0-9]*$/.test(name) || name.slice(1) in out) throw new Error("invalid shading dictionary key");
    out[name.slice(1)] = readValue(r);
  }
  r.at++;
  return out;
}

function readArray(r: Reader): PsValue[] {
  const out: PsValue[] = [];
  while (r.tokens[r.at] !== "]") {
    if (r.at >= r.tokens.length) throw new Error("unclosed shading array");
    out.push(readValue(r));
  }
  r.at++;
  return out;
}
