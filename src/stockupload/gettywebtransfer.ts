// gettywebtransfer.ts — one icon per call into the loopback helper's Getty web
// session: read the JPEG (+ optional EPS), apply the in-memory title/description
// copy when enabled, and let the contributor page's own uploader take them.

import { readBytesAt, type DirHandleLike } from "../lib/fs";
import { gettyWebFileOrder, validateGettyWebTasks } from "../lib/stockupload/gettyweb";
import {
  uploadBridgeGettyWeb, type GettyWebFile, type GettyWebResult, type GettyWebUploadInput,
} from "../lib/stockupload/gettywebclient";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { PlannedTransfer, SkippedFormat } from "../lib/stockupload/plan";
import { prepareMetadataCopy } from "../lib/stockupload/sendmeta";
import type { ExportedItem, StockFtpPreset } from "../lib/stockupload/types";

export interface GettyWebGroupInput {
  tasks: PlannedTransfer[];
  missing: readonly SkippedFormat[];
  root: DirHandleLike;
  target: StockFtpPreset;
  creds: FtpCredentials;
  item?: ExportedItem;
  combine: boolean;
  batchName: string;
  submissionType: string;
  sessionKey: string;
  bridgeUrl: string;
  signal: AbortSignal;
  uploadFn?: (input: GettyWebUploadInput) => Promise<GettyWebResult>;
}

function failed(reason: string): GettyWebResult {
  return { ok: false, code: "bad-request", reason };
}

/** Reads the pair from disk; null when a file vanished between plan and send. */
async function readPair(input: GettyWebGroupInput, ordered: readonly PlannedTransfer[]): Promise<GettyWebFile[] | null> {
  const files: GettyWebFile[] = [];
  for (const task of ordered) {
    const bytes = task.relPath ? await readBytesAt(input.root, task.relPath) : null;
    if (!bytes?.byteLength) return null;
    files.push({ name: task.fileName, bytes });
  }
  return files;
}

/** Applies the upload-only "Title + description" copy to each outgoing file. */
async function combineMetadata(input: GettyWebGroupInput, files: GettyWebFile[]): Promise<GettyWebFile[] | string> {
  if (!input.combine) return files;
  if (!input.item) return "Item no longer present";
  try {
    const copies = [];
    for (const file of files) copies.push({ name: file.name, bytes: await prepareMetadataCopy(input.item, file.name, file.bytes) });
    return copies;
  } catch (err) {
    return (err as Error).message || "Could not prepare upload metadata";
  }
}

/** Uploads one icon (JPEG + optional EPS) into the shared Getty web batch. */
export async function uploadGettyWebGroup(input: GettyWebGroupInput): Promise<GettyWebResult> {
  const invalid = validateGettyWebTasks(input.tasks, input.missing);
  if (invalid !== null) return failed(invalid);
  const ordered = gettyWebFileOrder(input.tasks);
  const read = await readPair(input, ordered);
  if (!read) return failed("Getty illustration file could not be read.");
  const files = await combineMetadata(input, read);
  if (typeof files === "string") return failed(files);
  const send = input.uploadFn ?? uploadBridgeGettyWeb;
  return send({
    bridgeUrl: input.bridgeUrl, preset: input.target, creds: input.creds, files,
    batchName: input.batchName, submissionType: input.submissionType,
    sessionKey: input.sessionKey, signal: input.signal,
  });
}
