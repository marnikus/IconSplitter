// registerimages.ts — take the AI SOURCE images that are ALREADY in the folder
// into the pair's own image history (Generate SVG tab, user request 2026-11-02).
//
// The tab shows the AI image the pair was approved with, plus whatever
// regenerations its own runs wrote. An image made earlier — an older build, a
// hand copy, the original before a split, a regeneration nobody recorded — sits in
// the same folder and stays invisible: the row keeps showing the wrong artwork and
// the file has to be remade. This action reads the folder once, records each
// matching PNG under the version its NAME says (`<stem>_v3.png` → v3, anything
// unnumbered → the next free number), and makes the newest NUMBERED one main.
//
// Honest edges: a file that is not a readable PNG is counted and said out loud,
// never recorded; a folder that holds only the pair's own image changes nothing
// and says so; a busy source is refused; nothing on disk is renamed or deleted.

import { useCallback, useRef } from "react";
import type { DirHandleLike } from "../lib/fs";
import { imageSummary, planImageImport, type FreshImage, type ImageTally } from "../lib/imgimport";
import type { PairMeta } from "../lib/pairmeta";
import { NO_COST } from "../lib/svgmodel";
import type { ImageVersion } from "../lib/svgimgreg";
import { log } from "../log/logstore";
import { saveMetaAt } from "../selection/pairstore";
import { fileTimeOf, isReadablePng, listPairImages } from "./imgfiles";
import { beginRegister } from "./registerprogress";
import { reserveSources, SOURCE_BUSY } from "./jobstate";
import { baseNameOf, namingOf, siblingsOf, usableRow, type RegisterCtx } from "./registernames";
import { toRow } from "./rowmodel";
import { metaForSource } from "./sources";
import type { SvgRow } from "./types";
import type { Slice } from "./actions";

/** What one folder contributed, so the caller can report it honestly. */
interface FolderOutcome {
  registered: number;
  skipped: number;
  others: string[];
  /** The version that became the main image, when one did. */
  shown: number | null;
}

/**
 * Registers existing AI sources for every selected source. One action for the
 * selection, one lease, one summary line — a failure in one folder never hides
 * another's work.
 */
export async function runRegisterImagesFor(c: RegisterCtx, ids: string[]): Promise<void> {
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
  const tally: ImageTally = { registered: 0, skipped: 0, folders: rows.length, shown: null, others: [] };
  if (rows.length === 1) Object.assign(tally, { stem: rows[0].source.stem, original: rows[0].source.name });
  const bar = beginRegister(c.refs, "images", rows.length);
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
  const line = imageSummary(tally);
  log({
    feature: "svg", action: "register-images",
    detail: `${tally.registered} registered, ${tally.skipped} skipped in ${tally.folders} folder(s)`,
    data: { registered: tally.registered, skipped: tally.skipped, folders: tally.folders },
  });
  c.say(line.text, line.err);
}

/** The names this pass must never re-register: the pair's own AI image and its reference. */
function skipOf(row: SvgRow): string[] {
  const reference = baseNameOf(row.source.sourcePath);
  return [row.source.name, ...(reference === null ? [] : [reference])];
}

/** One pair's folder: plan from its file names, prove each PNG, write once. */
async function registerOne(c: RegisterCtx, root: DirHandleLike, row: SvgRow): Promise<FolderOutcome> {
  const base = c.refs.metas.get(row.source.id) ?? row.meta ?? metaForSource(row.source, null);
  const files = await listPairImages(root, row.source.dirPath);
  const plan = planImageImport({
    self: namingOf(row), files, versions: base.imageVersions, siblings: siblingsOf(c, row), skip: skipOf(row),
  });
  const empty: FolderOutcome = { registered: 0, skipped: 0, others: plan.others, shown: null };
  if (plan.fresh.length === 0) return empty;
  const read = await recordsOf(root, plan.fresh);
  if (read.records.length === 0) return { ...empty, skipped: read.skipped };
  const meta = applyRecords(base, read.records, plan.named);
  return save(c, row, meta, { before: base.imageVersions.length, skipped: read.skipped, others: plan.others });
}

/** Each candidate proved to be a readable PNG; unreadable ones are counted. */
async function recordsOf(
  root: DirHandleLike, fresh: readonly FreshImage[],
): Promise<{ records: ImageVersion[]; skipped: number }> {
  const records: ImageVersion[] = [];
  let skipped = 0;
  for (const file of fresh) {
    if (await isReadablePng(root, file.path)) records.push(recordOf(file, await fileTimeOf(root, file.path)));
    else skipped++;
  }
  return { records, skipped };
}

/** One image's version record — the same shape a regeneration writes, marked as found. */
function recordOf(file: FreshImage, foundAt: number | null): ImageVersion {
  // A found image keeps its OWN time, so "AI source created" is the artwork's age.
  const updatedAt = foundAt === null ? new Date().toISOString() : new Date(foundAt).toISOString();
  return {
    version: file.version, file: file.path, status: "done", prompt: "", model: "existing file",
    requestId: null, error: null, updatedAt,
    usage: { input: null, output: null, total: null }, cost: { ...NO_COST },
  };
}

/**
 * Every record into the pair, then the newest NUMBERED one becomes the main image.
 * An unnumbered file never moves the pointer on its own: it is taken in so it is
 * visible, but the image the pair shows stays what the user chose.
 */
function applyRecords(base: PairMeta, records: readonly ImageVersion[], named: number | null): PairMeta {
  const versions = [...base.imageVersions, ...records].sort((a, b) => a.version - b.version);
  const preferred = named === null ? base.imagePreferred : Math.max(base.imagePreferred ?? 0, named);
  return { ...base, imageVersions: versions, imagePreferred: preferred };
}

interface SaveDone {
  before: number;
  skipped: number;
  others: string[];
}

/** Writes the pair's own file; a refused write reports and changes no row. */
async function save(c: RegisterCtx, row: SvgRow, meta: PairMeta, done: SaveDone): Promise<FolderOutcome> {
  const root = c.refs.root.current as DirHandleLike | null;
  const failed: FolderOutcome = { registered: 0, skipped: done.skipped, others: done.others, shown: null };
  if (root === null) {
    c.say(`Could not save the AI sources of ${row.source.name}`, true);
    return failed;
  }
  try {
    await saveMetaAt(root, row.source.metaPath, meta);
  } catch {
    c.say(`Could not save the AI sources of ${row.source.name} — nothing changed`, true);
    return failed;
  }
  c.refs.metas.set(row.source.id, meta);
  c.setRowsFn((rows) => rows.map((r) => (r.source.id === row.source.id ? toRow(r.source, meta, false) : r)));
  const changed = meta.imagePreferred !== null && meta.imagePreferred !== (row.meta?.imagePreferred ?? null);
  return { registered: meta.imageVersions.length - done.before, skipped: done.skipped, others: done.others, shown: changed ? meta.imagePreferred : null };
}

/** The button's handler: reads the latest context, so one callback serves every render. */
export function useRegisterImageActions(ctx: RegisterCtx): Slice<"registerImages"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const registerImages = useCallback((ids: string[]) => {
    void runRegisterImagesFor(latest.current, ids);
  }, []);
  return { registerImages };
}
