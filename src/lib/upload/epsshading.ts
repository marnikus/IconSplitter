// Validate precisely the vector shading/function dictionaries our emitter uses.
import { parsePsData, type PsDict, type PsValue } from "./epspsdata";

export function checkShading(text: string): void {
  const d = dictionary(parsePsData(text));
  keys(d, ["ShadingType", "ColorSpace", "Coords", "Function", "Extend"]);
  if (![2, 3].includes(d.ShadingType as number) || d.ColorSpace !== "DeviceRGB") fail();
  const coords = numbers(d.Coords, d.ShadingType === 2 ? 4 : 6);
  checkCoordinates(d.ShadingType as number, coords);
  if (JSON.stringify(d.Extend) !== "[true,true]") fail();
  checkFunction(d.Function);
}

function checkFunction(value: PsValue): void {
  const d = dictionary(value);
  if (JSON.stringify(d.Domain) !== "[0,1]") fail();
  if (d.FunctionType === 2) return checkExponential(d);
  keys(d, ["FunctionType", "Domain", "Functions", "Bounds", "Encode"]);
  if (d.FunctionType !== 3 || !Array.isArray(d.Functions)) fail();
  const funcs = d.Functions as PsValue[];
  if (funcs.length < 1 || funcs.length > 8192) fail();
  const bounds = numbers(d.Bounds, funcs.length - 1);
  if (bounds.some((b, i) => b <= (bounds[i - 1] ?? 0) || b >= 1)) fail();
  const encode = numbers(d.Encode, funcs.length * 2);
  if (encode.some((n, i) => n !== i % 2)) fail();
  for (const f of funcs) checkExponential(dictionary(f));
}

function checkExponential(d: PsDict): void {
  keys(d, ["FunctionType", "Domain", "C0", "C1", "N"]);
  if (d.FunctionType !== 2 || d.N !== 1 || JSON.stringify(d.Domain) !== "[0,1]") fail();
  for (const key of ["C0", "C1"]) {
    if (numbers(d[key], 3).some((n) => n < 0 || n > 1)) fail();
  }
}

function dictionary(v: PsValue): PsDict {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail();
  return v as PsDict;
}

function numbers(v: PsValue, size: number): number[] {
  if (!Array.isArray(v) || v.length !== size) fail();
  if ((v as PsValue[]).some((n) => typeof n !== "number" || !Number.isFinite(n))) fail();
  return v as number[];
}

function keys(d: PsDict, expected: string[]): void {
  if (Object.keys(d).length !== expected.length || expected.some((k) => !(k in d))) fail();
}

function fail(): never { throw new Error("invalid or raster-bearing EPS shading dictionary"); }

function checkCoordinates(type: number, coords: number[]): void {
  if (type === 2 && coords[0] === coords[2] && coords[1] === coords[3]) fail();
  if (type === 3) checkRadial(coords);
}

function checkRadial(c: number[]): void {
  if (c[2] !== 0 || c[5] <= 0 || Math.hypot(c[0] - c[3], c[1] - c[4]) >= c[5]) fail();
}
