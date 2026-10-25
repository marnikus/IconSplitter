// Four-sided percentages, with legacy uniform numbers and source-default null.
import { isRecord } from "../isrecord";
import { clampPaddingPct } from "./settingsnumbers";

export const PADDING_SIDES = ["left", "right", "top", "bottom"] as const;
export type PaddingSide = typeof PADDING_SIDES[number];
export type PaddingSides = Record<PaddingSide, number>;
export type Padding = number | PaddingSides | null;

/** A legacy uniform percentage and four explicit sides share one geometry path. */
export function paddingSides(value: Exclude<Padding, null>): PaddingSides {
  return typeof value === "number" ? { left: value, right: value, top: value, bottom: value } : value;
}

/** Equal sides retain the legacy stored representation and fingerprint. */
export function compactPadding(value: PaddingSides): number | PaddingSides {
  return PADDING_SIDES.every((side) => value[side] === value.left) ? value.left : value;
}

/** Validate defaults field-by-field, preserving the original source sentinel. */
export function normalizePadding(raw: unknown): Padding {
  if (raw === null) return null;
  if (!isRecord(raw)) return clampPaddingPct(raw);
  const sides = Object.fromEntries(PADDING_SIDES.map((side) => [side, clampPaddingPct(raw[side])])) as PaddingSides;
  return compactPadding(sides);
}

/** An override must be a complete finite set, never an accidental pin from junk. */
export function readPaddingOverride(raw: unknown): Padding | undefined {
  if (raw === null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return clampPaddingPct(raw);
  if (!isRecord(raw)) return undefined;
  if (!PADDING_SIDES.every((side) => typeof raw[side] === "number" && Number.isFinite(raw[side]))) return undefined;
  return normalizePadding(raw);
}

/** Exact settings equality for undo; null and absent pins are distinct. */
export function paddingEqual(a: Padding | undefined, b: Padding | undefined): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const left = paddingSides(a), right = paddingSides(b);
  return PADDING_SIDES.every((side) => left[side] === right[side]);
}

/** Output fingerprint token: the numeric legacy token when all four sides match. */
export function paddingToken(value: Padding): string | number | number[] {
  if (value === null) return "default";
  const sides = paddingSides(value);
  const values = PADDING_SIDES.map((side) => Math.round(sides[side] * 1000) / 1000);
  return values.every((v) => v === values[0]) ? values[0] : values;
}

/** Percentages to nonnegative user-unit margins, shared by content/pinned fits. */
export function scaledPadding(value: Exclude<Padding, null>, factor: number): PaddingSides {
  const sides = paddingSides(value);
  return Object.fromEntries(PADDING_SIDES.map((side) => [side, Math.max(0, sides[side]) * factor])) as PaddingSides;
}

/** Compact row text must show asymmetric values, never `[object Object]`. */
export function paddingLabel(value: Padding): string {
  if (value === null) return "default";
  if (typeof value === "number") return `${value}%`;
  return PADDING_SIDES.map((side) => `${side[0].toUpperCase()} ${value[side]}%`).join(" / ");
}
