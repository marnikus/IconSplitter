// exportopts.ts — the Sheets export settings as a pure value: the size choices
// the <select> offers, the defaults, and the reader used when they come back
// from a restart. Owns them so the UI and the session snapshot cannot drift
// apart (one owner per value, RULE 13).

import { isRecord } from "./isrecord";

export interface SheetOpts {
  /** Percentage padding on each side of every icon. */
  padding: number;
  /** Target square size in px; 0 means "native size". */
  size: number;
  transparent: boolean;
}

export const PADDING_MAX = 25;

export const SIZES: { v: number; l: string }[] = [
  { v: 0, l: "Native (auto)" },
  { v: 128, l: "128 × 128" },
  { v: 256, l: "256 × 256" },
  { v: 512, l: "512 × 512" },
  { v: 1024, l: "1024 × 1024" },
  { v: 2048, l: "2048 × 2048" },
];

export const DEFAULT_SHEET_OPTS: SheetOpts = { padding: 6, size: 512, transparent: false };

export function parseSheetOpts(raw: unknown): SheetOpts {
  if (!isRecord(raw)) return DEFAULT_SHEET_OPTS;
  return {
    padding: parsePadding(raw.padding),
    size: parseSize(raw.size),
    transparent: raw.transparent === true,
  };
}

function parsePadding(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_SHEET_OPTS.padding;
  return Math.min(Math.max(Math.round(raw), 0), PADDING_MAX);
}

/** 0 is a real choice ("native"), so membership — not truthiness — decides. */
function parseSize(raw: unknown): number {
  return SIZES.some((s) => s.v === raw) ? (raw as number) : DEFAULT_SHEET_OPTS.size;
}
