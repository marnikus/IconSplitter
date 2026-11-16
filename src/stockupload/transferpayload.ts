// transferpayload.ts — reads (or packs) the bytes one planned task sends.

import { readBytesAt, type DirHandleLike } from "../lib/fs";
import { prepareMetadataCopy } from "../lib/stockupload/sendmeta";
import type { PlannedTransfer } from "../lib/stockupload/plan";
import type { ExportedItem } from "../lib/stockupload/types";
import { buildRepresentationZip } from "../lib/stockupload/zippack";

export type TransferPayload = { ok: true; bytes: Uint8Array } | { ok: false; reason: string };

/** The file's own bytes, a fresh representation ZIP, or a metadata-combined copy. */
export async function resolveTransferBytes(
  root: DirHandleLike, item: ExportedItem, task: PlannedTransfer, combine: boolean,
): Promise<TransferPayload> {
  let bytes: Uint8Array | null;
  if (task.format === "zip" && task.relPath === null) {
    const packed = await buildRepresentationZip(root, item);
    if (!packed.ok) return packed;
    bytes = packed.bytes;
  } else {
    bytes = task.relPath ? await readBytesAt(root, task.relPath) : null;
  }
  if (!bytes?.byteLength) return { ok: false, reason: `${task.fileName} could not be read` };
  if (!combine) return { ok: true, bytes };
  try { return { ok: true, bytes: await prepareMetadataCopy(item, task.fileName, bytes) }; }
  catch (err) { return { ok: false, reason: (err as Error).message || "Could not prepare upload metadata" }; }
}
