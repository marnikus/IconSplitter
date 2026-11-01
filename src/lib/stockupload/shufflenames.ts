// The names every chunked target uploads under: the icon's place in the upload
// order in front of the real name, kept both ways — the site sorts by name, the
// app must still know which picture a card belongs to.

import { randomBatchOrder, similarityKeyOf, spreadSimilar } from "./gettyweb";

/** Zero-padded so the page's own name sort stays numeric, up to 9999 icons. */
const RANK_DIGITS = 4;

/** `0007-icon-snowflake_2_01.jpg` — the rank the site sorts on, then the real name. */
export function stagedFileName(rank: number, fileName: string): string {
  const leaf = String(fileName ?? "").split(/[\\/]/).pop() ?? "";
  const place = Math.max(0, Math.trunc(Number(rank) || 0));
  return `${String(place).padStart(RANK_DIGITS, "0")}-${leaf}`;
}

/** The real name behind a staged one; a name without a rank is left alone. */
export function realNameOf(fileName: string): string {
  return String(fileName ?? "").replace(/^\d{4}-/, "");
}

/** One rank per icon of one request, drawn fresh: the shuffle of a web batch. */
export function stagedRanks(names: readonly string[], rng: () => number = Math.random): number[] {
  const order = spreadSimilar(randomBatchOrder(names.length, rng), (index) => similarityKeyOf(names[index]));
  return ranksOf(names.length, order);
}

/** Ranks in the order of the map rather than of a draw. */
function ranksOf(count: number, order: readonly number[]): number[] {
  const ranks = new Array<number>(Math.max(0, count)).fill(0);
  order.forEach((index, position) => { ranks[index] = position + 1; });
  return ranks;
}
