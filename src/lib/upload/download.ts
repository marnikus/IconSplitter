// download.ts — "Download all" (2026-10-08, design
// docs/archive/2026-10-08-upload-download-all/design.md): the pure planner
// behind the button. The selection's export records say which artifacts exist
// (the record is what the commit wrote LAST, so it names only verified files);
// this module turns them into the files ONE destination folder receives —
// each under its own artifact name, two icons with the same stem kept apart —
// and spells the one honest line about the result. No I/O here: the copy
// itself lives in src/upload/downloadactions.ts.

import { ARTIFACT_EXTS, type ExportRecord } from "./export";

/** What the planner needs to know about one selected row. */
export interface DownloadSource {
  id: string;
  base: string;
  record: ExportRecord | null;
}

/** One file to copy: the root-relative source path and its name in the destination. */
export interface DownloadItem {
  id: string;
  base: string;
  from: string;
  to: string;
}

export interface DownloadPlan {
  items: DownloadItem[];
  /** Selected rows with no committed record — nothing to copy, said so. */
  notExported: number;
  /** Icons with at least one file to copy. */
  icons: number;
}

/** The files the selection's records name, each under its artifact name; colliding stems take " (n)". */
export function planDownload(rows: readonly DownloadSource[]): DownloadPlan {
  const taken = new Map<string, number>();
  const items: DownloadItem[] = [];
  let notExported = 0;
  let icons = 0;
  for (const row of rows) {
    if (row.record === null) { notExported += 1; continue; }
    const files = artifactsOf(row.record);
    if (files.length === 0) continue;
    icons += 1;
    const stem = uniqueStem(taken, stemOfPath(files[0].path));
    for (const file of files) items.push({ id: row.id, base: row.base, from: file.path, to: `${stem}.${file.ext}` });
  }
  return { items, notExported, icons };
}

/** The record's committed artifacts, in svg → jpg → eps order. */
function artifactsOf(record: ExportRecord): { ext: string; path: string }[] {
  return ARTIFACT_EXTS.flatMap((ext) => {
    const out = record.outputs[ext];
    return out === null ? [] : [{ ext, path: out.path }];
  });
}

/** `architecture/export/fog.svg` → `fog`. */
function stemOfPath(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name.replace(/\.[^.]+$/, "");
}

/** The first icon with a stem keeps it; the next ones take `stem (2)`, `stem (3)`… */
function uniqueStem(taken: Map<string, number>, stem: string): string {
  const n = (taken.get(stem) ?? 0) + 1;
  taken.set(stem, n);
  return n === 1 ? stem : `${stem} (${n})`;
}

export interface DownloadResult {
  saved: number;
  icons: number;
  /** A name already in the destination — kept, never overwritten (RULE 23). */
  kept: number;
  /** The record named a file the disk no longer has. */
  missing: number;
  /** A write whose read-back did not match — removed. */
  failed: number;
  notExported: number;
}

/** "Saved 9 files (3 icons) to stock-drop · 2 kept (already there) · 1 icon not exported yet". */
export function downloadLine(r: DownloadResult, folder: string): string {
  const head = r.saved === 0
    ? `Nothing to save to ${folder}`
    : `Saved ${plural(r.saved, "file")} (${plural(r.icons, "icon")}) to ${folder}`;
  const parts = [
    r.kept > 0 ? `${r.kept} kept (already there)` : "",
    r.missing > 0 ? `${r.missing} missing on disk` : "",
    r.failed > 0 ? `${r.failed} failed` : "",
    r.notExported > 0 ? `${plural(r.notExported, "icon")} not exported yet` : "",
  ].filter((p) => p !== "");
  return [head, ...parts].join(" · ");
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
