// gettywebprep.ts — turns one planned icon into the bytes a Getty batch sends:
// read its JPEG (and matching EPS) from `export/`, refuse what Getty cannot take,
// and apply the upload-only title+description copy when the user asked for it.

import { readBytesAt, type DirHandleLike } from "../fs";
import { gettyWebFileOrder, gettyWebMetadataOf, validateGettyWebTasks } from "./gettyweb";
import type { GettyWebFile, GettyWebIcon } from "./gettywebclient";
import type { PlannedTransfer, SkippedFormat } from "./plan";
import { prepareMetadataCopy } from "./sendmeta";
import type { ExportedItem } from "./types";

/** One icon of a run: the tasks the plan gives it and the row it came from. */
export interface GettyWebIconInput {
  tasks: PlannedTransfer[];
  missing: readonly SkippedFormat[];
  item?: ExportedItem;
}

/** Reads one icon's pair from disk; null when a file vanished since the plan. */
async function readIcon(root: DirHandleLike, icon: GettyWebIconInput): Promise<GettyWebFile[] | null> {
  const files: GettyWebFile[] = [];
  for (const task of gettyWebFileOrder(icon.tasks)) {
    const bytes = task.relPath ? await readBytesAt(root, task.relPath) : null;
    if (!bytes?.byteLength) return null;
    files.push({ name: task.fileName, bytes });
  }
  return files;
}

/** Applies the upload-only "Title + description" copy to one icon's files. */
async function combined(files: GettyWebFile[], item: ExportedItem | undefined): Promise<GettyWebFile[] | string> {
  if (!item) return "Item no longer present";
  try {
    const copies = [];
    for (const file of files) copies.push({ name: file.name, bytes: await prepareMetadataCopy(item, file.name, file.bytes) });
    return copies;
  } catch (err) {
    return (err as Error).message || "Could not prepare upload metadata";
  }
}

/**
 * One icon, ready to send — or the reason it cannot be sent at all. Nothing is
 * sent for a refused icon, so a half pair or a PNG never reaches the page.
 */
export async function prepareGettyWebIcon(
  root: DirHandleLike,
  icon: GettyWebIconInput,
  combine: boolean,
): Promise<GettyWebIcon | string> {
  const invalid = validateGettyWebTasks(icon.tasks, icon.missing);
  if (invalid !== null) return invalid;
  const read = await readIcon(root, icon);
  if (!read) return "Getty illustration file could not be read.";
  if (!combine) return { files: read, metadata: icon.item ? gettyWebMetadataOf(icon.item) : null };
  const files = await combined(read, icon.item);
  if (typeof files === "string") return files;
  return { files, metadata: icon.item ? gettyWebMetadataOf(icon.item) : null };
}
