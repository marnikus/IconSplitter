// downloadrun.ts — the I/O of "Download all" (2026-10-08). For each planned icon:
// read every file from its package, prove that it is the committed bytes (the
// record's size and sha256), choose a stem no file in the folder holds, create
// each file only if its name is free, and read the copy back before it counts as
// saved (RULE 15, RULE 23). The loop is sequential, one icon at a time, and a
// failure is isolated to the file that caused it (RULE 5). A cancel is honoured
// between icons (RULE 7). The rules are in lib/upload/download.ts.

import { listChildNames, nameExists, type DirHandleLike } from "../lib/fs";
import {
  allocateStem, matchesCommitted, type DownloadRunResult, type PlannedFile, type PlannedIcon,
} from "../lib/upload/download";
import { readBytesAt } from "./runexport";

export interface DownloadRunArgs {
  /** The picked root: the packages are read from here and never written. */
  root: DirHandleLike;
  /** The folder the user chose: the only place a file is written. */
  dest: DirHandleLike;
  icons: readonly PlannedIcon[];
  signal: AbortSignal;
  /** Before each icon: its position, the total and its name (the progress line). */
  onProgress: (index: number, total: number, name: string) => void;
}

/** A planned file whose bytes were read and proven to be the committed ones. */
interface ProvenFile {
  file: PlannedFile;
  bytes: Uint8Array;
}

/** Saves every planned icon, one at a time. A failure is counted and named, never thrown. */
export async function runDownload(args: DownloadRunArgs): Promise<DownloadRunResult> {
  const taken = await takenNames(args.dest).catch(() => null);
  if (taken === null) {
    return { ...emptyResult(), failures: [{ name: args.dest.name, why: "the folder could not be listed" }] };
  }
  const result = emptyResult();
  for (const [index, icon] of args.icons.entries()) {
    if (args.signal.aborted) {
      result.stopped = true;
      break;
    }
    args.onProgress(index, args.icons.length, icon.name);
    await saveIconSafely(args, icon, taken, result);
    result.done += 1;
    await yieldToUi();
  }
  return result;
}

/** One icon, isolated (RULE 5): an unexpected error costs that icon, is named, and the run goes on. */
async function saveIconSafely(
  args: DownloadRunArgs, icon: PlannedIcon, taken: Set<string>, result: DownloadRunResult,
): Promise<void> {
  try {
    await saveIcon(args, icon, taken, result);
  } catch (err) {
    result.failures.push({ name: icon.name, why: `could not be saved (${reasonOf(err)})` });
  }
}

/** One icon: prove its files, choose its stem, then write each file on its own. Counts as it goes. */
async function saveIcon(
  args: DownloadRunArgs, icon: PlannedIcon, taken: Set<string>, result: DownloadRunResult,
): Promise<void> {
  result.missing += icon.absent.length;
  const proven = await provenFilesOf(args.root, icon.files, result);
  if (proven.length === 0) return;
  const stem = allocateStem(icon.stem, taken);
  if (stem !== icon.stem) result.renamed += 1;
  let savedHere = 0;
  for (const item of proven) {
    const name = `${stem}.${item.file.kind}`;
    taken.add(name.toLowerCase()); // reserved before the write: a failed name is never reused in this run
    const why = await writeProven(args.dest, name, item);
    if (why !== null) {
      result.failures.push({ name, why });
      continue;
    }
    result.saved += 1;
    if (savedHere === 0) result.savedIcons += 1;
    savedHere += 1;
  }
}

/** Reads each planned file and keeps the ones that are still the committed bytes; the rest count as missing. */
async function provenFilesOf(root: DirHandleLike, files: readonly PlannedFile[], result: DownloadRunResult): Promise<ProvenFile[]> {
  const proven: ProvenFile[] = [];
  for (const file of files) {
    const bytes = await readBytesAt(root, file.path);
    if (bytes !== null && (await matchesCommitted(bytes, file))) proven.push({ file, bytes });
    else result.missing += 1;
  }
  return proven;
}

/** Creates one file, reads it back and proves it. Returns null when saved, else the plain reason. */
async function writeProven(dest: DirHandleLike, name: string, item: ProvenFile): Promise<string | null> {
  try {
    await createNew(dest, name, item.bytes);
  } catch (err) {
    return `could not be written (${reasonOf(err)})`;
  }
  const back = await readBytesAt(dest, name);
  if (back !== null && (await matchesCommitted(back, item.file))) return null;
  await removeQuietly(dest, name);
  return "the copy did not read back the same bytes";
}

/** Creates a file whose name is free. If the write fails after the create, the partial file is removed. */
async function createNew(dest: DirHandleLike, name: string, bytes: Uint8Array): Promise<void> {
  if (await nameExists("file", dest, name)) throw new Error("the name is already taken");
  const handle = await dest.getFileHandle(name, { create: true });
  try {
    const writer = await handle.createWritable();
    await writer.write(new Blob([bytes as BlobPart]));
    await writer.close();
  } catch (err) {
    await removeQuietly(dest, name);
    throw err;
  }
}

/** Best effort: removes a file this run created. The caller has already reported the failure. */
async function removeQuietly(dir: DirHandleLike, name: string): Promise<void> {
  try {
    await dir.removeEntry?.(name);
  } catch {
    // a file that cannot be removed stays where it is; its failure is already reported
  }
}

/** The folder's names as they are now, lower-cased: a second run never reuses a name the first one wrote. */
async function takenNames(dest: DirHandleLike): Promise<Set<string>> {
  return new Set((await listChildNames(dest)).map((name) => name.toLowerCase()));
}

function reasonOf(err: unknown): string {
  return err instanceof Error && err.message !== "" ? err.message : "the browser refused the write";
}

function emptyResult(): DownloadRunResult {
  return { done: 0, stopped: false, saved: 0, savedIcons: 0, missing: 0, renamed: 0, failures: [] };
}

/** Gives the browser a turn between icons, so the progress line and the cancel button stay live (RULE 5). */
function yieldToUi(): Promise<void> {
  return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}
