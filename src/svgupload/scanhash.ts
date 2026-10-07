// scanhash.ts — the scan's content-identity step (merge report R02/R03). Split
// from usescan so the rule is provable without a DOM: for every row that has a
// chosen file, read THAT file's bytes and state their SHA-256. Reads run one at
// a time — a scan may list thousands of icons and the identities must not all be
// held in memory at once. A file whose bytes cannot be read keeps the stamp the
// scan already gave it: a possibly wrong answer that is at least honest, never
// an invented one and never an empty string that would compare equal to anything.

import type { DirHandleLike } from "../lib/fs";
import type { UploadRow } from "../lib/svgupload/rows";
import { SOURCE_HASH_PREFIX, sha256Hex } from "../lib/svgupload/sourcehash";
import { resolveFile } from "../selection/handles";

/** The chosen file's content identity, or null when its bytes cannot be read. */
export async function hashFileAt(root: DirHandleLike, relPath: string): Promise<string | null> {
  const handle = await resolveFile(root, relPath);
  if (handle === null) return null;
  try {
    const bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer());
    return `${SOURCE_HASH_PREFIX}${await sha256Hex(bytes)}`;
  } catch {
    return null;
  }
}

/** The same rows, each chosen file identified by its content. */
export async function attachSourceHashes(root: DirHandleLike, rows: readonly UploadRow[]): Promise<UploadRow[]> {
  const out: UploadRow[] = [];
  for (const row of rows) out.push(await withHash(root, row));
  return out;
}

async function withHash(root: DirHandleLike, row: UploadRow): Promise<UploadRow> {
  if (row.svgPath === null) return row;
  const hash = await hashFileAt(root, row.svgPath);
  return hash === null ? row : { ...row, fingerprint: hash };
}
