// reviewstore.ts — decision-file IO for Selection review (RULE 13).
// The file lives at <root>/review-decisions.json. Browsers offer no rename,
// so "atomic" = write sidecar tmp -> read back + verify -> overwrite main ->
// delete tmp. Any failed step throws; the caller keeps in-memory records and
// offers Retry (spec §8/§10). A missing file is created empty (all pending).

import type { DirHandleLike } from "../lib/fs";
import { tryGetFile, writeFileOverwrite } from "../lib/fs";
import { parseDecisions, serializeDecisions, type ReviewRecord } from "../lib/reviewfile";

export const DECISIONS_FILE = "review-decisions.json";
export const TMP_FILE = "review-decisions.tmp.json";

export interface LoadOut {
  records: ReviewRecord[];
  missing: boolean;
  corrupt: boolean;
}

export async function loadDecisions(root: DirHandleLike): Promise<LoadOut> {
  const fh = await tryGetFile(root, DECISIONS_FILE);
  if (!fh) return await createEmpty(root);
  const parsed = parseDecisions(await (await fh.getFile()).text());
  if (!parsed.ok) return { records: [], missing: false, corrupt: true };
  return { records: parsed.records, missing: false, corrupt: false };
}

async function createEmpty(root: DirHandleLike): Promise<LoadOut> {
  try {
    await writeFileOverwrite(root, DECISIONS_FILE, new Blob([serializeDecisions([])]));
  } catch {
    // read-only root: review still works in memory; saves will surface errors
  }
  return { records: [], missing: true, corrupt: false };
}

export async function saveDecisions(root: DirHandleLike, records: ReviewRecord[]): Promise<void> {
  const text = serializeDecisions(records);
  await writeAndVerifyTmp(root, text);
  await writeFileOverwrite(root, DECISIONS_FILE, new Blob([text]));
  await removeTmp(root);
}

async function writeAndVerifyTmp(root: DirHandleLike, text: string): Promise<void> {
  const tmp = await root.getFileHandle(TMP_FILE, { create: true });
  const w = await tmp.createWritable();
  await w.write(new Blob([text]));
  await w.close();
  const back = await (await tmp.getFile()).text();
  if (countRecords(back) !== countRecords(text)) throw new Error("tmp verify failed");
}

function countRecords(text: string): number {
  const p = parseDecisions(text);
  return p.ok ? p.records.length : -1;
}

async function removeTmp(root: DirHandleLike): Promise<void> {
  try {
    await root.removeEntry?.(TMP_FILE);
  } catch {
    // leftover tmp is harmless; next save overwrites it
  }
}
