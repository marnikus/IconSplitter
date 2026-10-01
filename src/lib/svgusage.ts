// svgusage.ts — token and cost reporting for SVG generation (prompt §14).
// Owns: formatting provider-reported numbers, summing a batch, and splitting a
// batch total across its images as a clearly-labelled ESTIMATE. A number the
// provider did not report is shown as "—", never invented.

import type { Usage } from "./svgrequest";

export const NO_NUMBER = "—";

/** "10.5k" for large counts, plain digits below 10k, "—" when unknown. */
export function fmtTokens(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return NO_NUMBER;
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString("en-US");
}

/** "$0.076" — four decimals, because a single icon costs fractions of a cent. */
export function fmtCost(cost: number | null): string {
  if (cost === null || !Number.isFinite(cost)) return NO_NUMBER;
  return cost === 0 ? "$0.00" : `$${cost.toFixed(4)}`;
}

/** One line for a row: totals first, then the cost with its actual/estimate tag. */
export function usageLine(u: Usage): string {
  const tokens = `${fmtTokens(u.input)} in · ${fmtTokens(u.output)} out · ${fmtTokens(u.total)} total`;
  return `${tokens} · ${costLabel(u)}`;
}

export function costLabel(u: Usage): string {
  if (u.cost !== null) return `${fmtCost(u.cost)} actual`;
  if (u.estimated !== undefined && u.estimated !== null) return `${fmtCost(u.estimated)} estimated`;
  return "no cost reported";
}

/** Totals for a set of requests; a field stays null when every part is null. */
export function sumUsage(list: readonly Usage[]): Usage {
  const acc = { input: 0, output: 0, total: 0, cost: 0, currency: "USD" };
  const seen = { tokens: false, cost: false };
  for (const u of list) accumulate(acc, seen, u);
  return finish(acc, seen);
}

interface Acc { input: number; output: number; total: number; cost: number; currency: string }
interface Seen { tokens: boolean; cost: boolean }

function accumulate(acc: Acc, seen: Seen, u: Usage): void {
  acc.input += u.input ?? 0;
  acc.output += u.output ?? 0;
  acc.total += u.total ?? 0;
  seen.tokens = seen.tokens || u.input !== null || u.output !== null || u.total !== null;
  if (u.cost !== null) {
    acc.cost += u.cost;
    acc.currency = u.currency;
    seen.cost = true;
  }
}

function finish(acc: Acc, seen: Seen): Usage {
  return {
    input: seen.tokens ? acc.input : null,
    output: seen.tokens ? acc.output : null,
    total: seen.tokens ? acc.total : null,
    cost: seen.cost ? acc.cost : null,
    currency: acc.currency,
  };
}

/**
 * Splits one batch's reported usage across its images. The result is an
 * estimate: it is stored with `estimated` set and `cost` null so it can never
 * be mistaken for a provider-reported number.
 */
export function allocateUsage(u: Usage, count: number): Usage {
  if (count <= 0) return { ...u, input: null, output: null, total: null, cost: null };
  const per = (n: number | null) => (n === null ? null : n / count);
  return {
    input: per(u.input),
    output: per(u.output),
    total: per(u.total),
    cost: null,
    estimated: u.cost === null ? null : u.cost / count,
    currency: u.currency,
  };
}
