// registerexisting.ts — take the SVGs that are ALREADY in the folder into the pair's
// history (Generate SVG tab, user request 2026-11-01).
//
// The tab lists what its own runs wrote, because that is what the pair file holds.
// An SVG made earlier, by another tool or by hand, sat beside the AI image and stayed
// invisible: the row said "not generated" and the file had to be regenerated or
// copied out. This action reads the folder once, adds every matching file as the
// version its NAME says (<stem>.svg → v1, <stem>_v3.svg → v3, a copy → the next free
// number), validates the document through the same gate a generated one passes, and
// writes the pair's own file — so afterwards the row is exactly the row a generation
// leaves: versions in order, the newest one shown and accepted.
//
// Honest edges: a file that is unreadable or does not validate is counted and said
// out loud, never recorded as a version; a pair whose record cannot be read is left
// alone; a busy source is refused; nothing on disk is ever renamed or deleted.

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { withReview, withVersion, type PairMeta } from "../lib/pairmeta";
import { withPreferred } from "../lib/pairpreferred";
import { parseSvg, validateSvg } from "../lib/svgvalidate";
import { countIcons } from "../lib/svgicons";
import type { SvgVersion } from "../lib/svgmodel";
import { importSummary, newestReadable, planImport, type ImportTally } from "../lib/svgimport";
import { log } from "../log/logstore";
import { saveMetaAt } from "../selection/pairstore";
import { metaForSource } from "./sources";
import { listSvgFiles, readSvgFile } from "./svgfiles";
import { toRow } from "./rowmodel";
import { beginRegister } from "./registerprogress";
import { reserveSources, SOURCE_BUSY } from "./jobstate";
import { namingOf, siblingsOf, usableRow, type RegisterCtx } from "./registernames";
import type { SvgRow } from "./types";
import type { Slice } from "./actions";

export type { RegisterCtx } from "./registernames";

/** One file the plan picked, with the version number it becomes. */
type ExistingFile = { name: string; version: number };

/** What one folder contributed, so the caller can report it honestly. */
interface FolderOutcome {
  meta: PairMeta | null;
  registered: number;
  skipped: number;
  shown: number | null;
  /** SVG files that are another pair's (or nobody's) — said out loud. */
  others: string[];
}

/**
 * Registers existing SVGs for every selected source. One action for the selection,
 * one lease, one summary line — a failure in one folder never hides another's work.
 */
export async function runRegisterFor(c: RegisterCtx, ids: string[]): Promise<void> {
  const root = c.refs.root.current as DirHandleLike | null;
  if (root === null) return c.say("No folder is open — nothing to look at", true);
  const rows = ids.map((id) => c.rows.find((r) => r.source.id === id)).filter(usableRow);
  if (rows.length === 0) return c.say("Select the items whose folder should be checked", true);
  const release = reserveSources(c, rows.map((r) => r.source.id));
  if (release === null) return c.say(SOURCE_BUSY, true);
  try {
    await runRegister(c, root, rows);
  } finally {
    release();
  }
}

async function runRegister(c: RegisterCtx, root: DirHandleLike, rows: SvgRow[]): Promise<void> {
  const tally: ImportTally = { registered: 0, skipped: 0, folders: rows.length, shown: null, others: [] };
  if (rows.length === 1) tally.stem = rows[0].source.stem;
  const bar = beginRegister(c.refs, "svg", rows.length);
  for (const row of rows) {
    bar.reading(row.source.name);
    const out = await registerOne(c, root, row);
    tally.registered += out.registered;
    tally.skipped += out.skipped;
    tally.others = [...(tally.others ?? []), ...out.others];
    if (out.shown !== null) tally.shown = Math.max(tally.shown ?? 0, out.shown);
    bar.settled({ registered: out.registered, skipped: out.skipped });
  }
  bar.finish();
  const line = importSummary(tally);
  log({
    feature: "svg", action: "register-existing",
    detail: `${tally.registered} registered, ${tally.skipped} skipped, ${(tally.others ?? []).length} not this pair's in ${tally.folders} folder(s)`,
    data: { registered: tally.registered, skipped: tally.skipped, folders: tally.folders },
  });
  c.say(line.text, line.err);
}

/** One pair's folder: plan from its file names, validate each document, write once. */
async function registerOne(c: RegisterCtx, root: DirHandleLike, row: SvgRow): Promise<FolderOutcome> {
  const base = c.refs.metas.get(row.source.id) ?? row.meta ?? metaForSource(row.source, null);
  const names = await listSvgFiles(root, row.source);
  const plan = planImport(namingOf(row), names, base.versions, siblingsOf(c, row));
  if (plan.fresh.length === 0) {
    return { meta: base, registered: 0, skipped: 0, shown: null, others: plan.others };
  }
  const read = await readAll(root, row, base.review, plan.fresh);
  if (read.records.length === 0) {
    return { meta: base, registered: 0, skipped: read.skipped, shown: null, others: plan.others };
  }
  const meta = applyRecords(base, read.records);
  return save(c, row, meta, { before: base.versions.length, skipped: read.skipped, others: plan.others });
}

/** The candidate files, each read and validated; unreadable ones are counted. */
async function readAll(
  root: DirHandleLike, row: SvgRow, review: SvgRow["review"], fresh: readonly ExistingFile[],
): Promise<{ records: SvgVersion[]; skipped: number }> {
  const records: SvgVersion[] = [];
  let skipped = 0;
  for (const file of fresh) {
    const record = await recordOf(root, row, file, review);
    if (record === null) skipped++;
    else records.push(record);
  }
  return { records, skipped };
}

/** One file's version record — the same shape a generation writes, marked as found. */
async function recordOf(
  root: DirHandleLike, row: SvgRow, file: ExistingFile, review: SvgRow["review"],
): Promise<SvgVersion | null> {
  const svgPath = row.source.dirPath === "" ? file.name : `${row.source.dirPath}/${file.name}`;
  const read = await readSvgFile(root, svgPath);
  if (read === null) return null;
  const check = validateSvg(read.code);
  if (!check.ok) return null;
  const now = new Date().toISOString();
  // A found file keeps its OWN creation time: registering a year-old artwork must
  // not make it look like today's work in the "SVG created" order.
  const found = read.lastModified === null ? now : new Date(read.lastModified).toISOString();
  return {
    version: file.version, svgPath, status: "generated", review,
    prompt: "", provider: "existing file", model: "", requestedAt: now, completedAt: now, fileTime: found,
    usage: { input: null, output: null, total: null }, cost: { actual: null, estimated: null, currency: "USD", pricing: "", basis: "none" },
    validation: { ok: true, errors: [], warnings: check.warnings, icons: iconCountOf(read.code) },
    batch: null, error: null, requestId: null,
  };
}

function iconCountOf(code: string): number {
  const { doc } = parseSvg(code);
  return doc ? countIcons(doc).icons : 0;
}

/**
 * Every record into the pair, then the newest readable one becomes the shown
 * version. The item's own status is put back afterwards: registering a FILE is
 * not a review decision, so an approval or a decline survives it.
 */
function applyRecords(base: PairMeta, records: readonly SvgVersion[]): PairMeta {
  const merged = withReview(records.reduce((meta, record) => withVersion(meta, record), base), base.review);
  const shown = newestReadable(merged.versions);
  return shown === null ? merged : withPreferred(merged, shown);
}

/** Writes the pair's own file; a refused write reports and changes no row. */
async function save(c: RegisterCtx, row: SvgRow, meta: PairMeta, done: SaveDone): Promise<FolderOutcome> {
  const root = c.refs.root.current as DirHandleLike | null;
  const registered = meta.versions.length - done.before;
  const failed: FolderOutcome = { meta: row.meta, registered: 0, skipped: done.skipped, shown: null, others: done.others };
  if (root === null) {
    c.say(`Could not save the SVG versions of ${row.source.name}`, true);
    return failed;
  }
  try {
    await saveMetaAt(root, row.source.metaPath, meta);
  } catch {
    c.say(`Could not save the SVG versions of ${row.source.name} — nothing changed`, true);
    return failed;
  }
  c.refs.metas.set(row.source.id, meta);
  c.setRowsFn((rows) => rows.map((r) => (r.source.id === row.source.id ? toRow(r.source, meta, false) : r)));
  return { meta, registered, skipped: done.skipped, shown: meta.preferred, others: done.others };
}

/** What the write needs to count: how many versions the pair had before. */
interface SaveDone {
  before: number;
  skipped: number;
  others: string[];
}

/** The button's handler: reads the latest context, so one callback serves every render. */
export function useRegisterActions(ctx: RegisterCtx): Slice<"registerExisting"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const registerExisting = useCallback((ids: string[]) => {
    void runRegisterFor(latest.current, ids);
  }, []);
  return { registerExisting };
}
