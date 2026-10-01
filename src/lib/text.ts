// text.ts — the one comparison helper the review modules share (RULE 16.4).
// Owns: locale-independent, case-insensitive text ordering so pair ids, paths
// and names sort the same on every machine.

export function compareText(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x < y) return -1;
  return x > y ? 1 : 0;
}
