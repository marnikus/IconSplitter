// svggrid.ts — square contact-sheet geometry for batched SVG generation.
// One request carries at most MAX_PER_REQUEST sources laid out in the smallest
// square grid that fits them; unused cells stay empty and never produce
// output. Pure math only (RULE 1, RULE 3).

export const MAX_PER_REQUEST = 9;

export interface GridLayout {
  cols: number;
  rows: number;
  /** cols * rows */
  cells: number;
  /** cells - image count */
  empty: number;
}

export function gridFor(count: number): GridLayout {
  if (count <= 0) return { cols: 0, rows: 0, cells: 0, empty: 0 };
  const n = Math.min(count, MAX_PER_REQUEST);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return { cols, rows, cells: cols * rows, empty: cols * rows - n };
}

/** Small stable fingerprint for composites/diagnostics (not cryptographic). */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
