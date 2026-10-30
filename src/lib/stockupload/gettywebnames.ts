// gettywebnames.ts — the names a **random** Getty web batch travels under. Getty
// lists a batch by file name, so the order readers see is decided by the names,
// not by the order of the request. The rank itself is shared with every other
// chunked target (`shufflenames.ts`); what is Getty-only is the pair rule and the
// mapping of Getty's own answer back to the real names.

import type { GettyWebIcon, GettyWebRejection, GettyWebResult } from "./gettywebclient";
import { realNameOf, stagedFileName } from "./shufflenames";

export { realNameOf, stagedFileName, stagedRanks, stableRanks } from "./shufflenames";

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
