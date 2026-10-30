// gettywebnames.ts — the names a **random** batch travels under. Getty lists a
// batch by file name, so the order readers see is decided by the names, not by
// the order of the request: every icon gets a shuffled rank in front of its real
// name, and both the real name and its rank stay readable to the app and to a
// person looking at the page.

import { randomBatchOrder, similarityKeyOf, spreadSimilar } from "./gettyweb";
import type { GettyWebIcon, GettyWebRejection, GettyWebResult } from "./gettywebclient";

/** Zero-padded so the page's own name sort stays numeric, up to 9999 icons. */
const RANK_DIGITS = 4;

/** `0007-icon-snowflake_2_01.jpg` — the rank Getty sorts on, then the real name. */
export function stagedFileName(rank: number, fileName: string): string {
  const leaf = String(fileName ?? "").split(/[\\/]/).pop() ?? "";
  const place = Math.max(0, Math.trunc(Number(rank) || 0));
  return `${String(place).padStart(RANK_DIGITS, "0")}-${leaf}`;
}

/** The real name behind a staged one; a name without a rank is left alone. */
export function realNameOf(fileName: string): string {
  return String(fileName ?? "").replace(/^\d{4}-/, "");
}

/**
 * One rank per icon of one request, so sorting the request by name gives the
 * shuffle: the rank order is the drawn-and-spread order, which means two sizes
 * of one picture are never neighbours even though the page sorts on the number.
 */
export function stagedRanks(names: readonly string[], rng: () => number = Math.random): number[] {
  const order = spreadSimilar(randomBatchOrder(names.length, rng), (index) => similarityKeyOf(names[index]));
  const ranks = new Array<number>(names.length).fill(0);
  order.forEach((index, position) => { ranks[index] = position + 1; });
  return ranks;
}

/** One icon as the page receives it: every file of the pair under the same rank. */
export function stagedIcon(icon: GettyWebIcon, rank: number): GettyWebIcon {
  return { ...icon, files: icon.files.map((file) => ({ name: stagedFileName(rank, file.name), bytes: file.bytes })) };
}

function realRejection(entry: GettyWebRejection): GettyWebRejection {
  return { ...entry, name: realNameOf(entry.name) };
}

/** The lists of one answer, under the names the plan and the rows know. */
function restoredLists(res: GettyWebResult): Record<string, unknown> {
  const lists: Record<string, unknown> = {};
  if (res.accepted !== undefined) lists.accepted = res.accepted.map(realNameOf);
  if (res.failed !== undefined) lists.failed = res.failed.map(realRejection);
  if (res.notReady !== undefined) lists.notReady = res.notReady.map(realNameOf);
  if (res.seen !== undefined) lists.seen = res.seen.map(realNameOf);
  return lists;
}

/**
 * Getty's answer read back by the real names: the page answers with the staged
 * ones, and every icon's fate is matched on its own name, so an accepted card
 * must not come back as a file Getty never listed.
 */
export function withRealNames(res: GettyWebResult): GettyWebResult {
  return { ...res, ...restoredLists(res) } as GettyWebResult;
}
