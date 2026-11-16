// registernames.ts — what the two "register what is already in the folder" passes
// share (SVGs 2026-11-01, AI sources 2026-11-02): the context they run in, the
// names a row's pair answers to, and the sibling pairs that can contest a file.
// One definition, so an SVG and an AI source are never matched by two different
// rules.

import type { Naming } from "../lib/foldernames";
import type { SvgRefs, SvgRow } from "./types";

/** Only what registering needs: the folder, the rows and the two writers. */
export interface RegisterCtx {
  refs: SvgRefs;
  rows: SvgRow[];
  say: (msg: string, err?: boolean) => void;
  setRowsFn: (fn: (rows: SvgRow[]) => SvgRow[]) => void;
}

/** The names this pair answers to: its AI stem and the names it had before a split. */
export function namingOf(row: SvgRow): Naming {
  return { stem: row.source.stem, base: row.source.base };
}

/** A row that can carry a record: present and not a corrupt pair file. */
export function usableRow(row: SvgRow | undefined): row is SvgRow {
  return row !== undefined && !row.corrupt;
}

/** The name a path ends in (a pair file or an AI image path). */
export function baseNameOf(relPath: string | null): string | null {
  if (relPath === null || relPath === "") return null;
  const parts = relPath.split("/");
  return parts[parts.length - 1] ?? null;
}

/** The pairs that share this folder — only they can contest a file name. */
export function siblingsOf(c: RegisterCtx, row: SvgRow): Naming[] {
  return c.rows
    .filter((r) => r.source.id !== row.source.id && r.source.dirPath === row.source.dirPath)
    .map(namingOf);
}
