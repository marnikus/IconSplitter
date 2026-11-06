// ESP illustrations must be sent as one contribution, not separate FTP files.
import { readBytesAt, type DirHandleLike } from "../lib/fs";
import { uploadBridgeFtps, type BridgeUploadInput, type BridgeUploadResult } from "../lib/stockupload/bridgeclient";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { PlannedTransfer, SkippedFormat } from "../lib/stockupload/plan";
import { prepareMetadataCopy } from "../lib/stockupload/sendmeta";
import type { ExportedItem, StockFtpPreset } from "../lib/stockupload/types";

interface EspGroupInput {
  tasks: PlannedTransfer[]; missing: readonly SkippedFormat[]; root: DirHandleLike;
  bridgeUrl: string; target: StockFtpPreset; creds: FtpCredentials; sessionKey: string;
  item?: ExportedItem; combine: boolean;
  signal: AbortSignal; uploadFn?: (input: BridgeUploadInput) => Promise<BridgeUploadResult>;
}

export function groupEspTasks(tasks: readonly PlannedTransfer[]): PlannedTransfer[][] {
  const groups = new Map<string, PlannedTransfer[]>();
  for (const task of tasks) groups.set(task.itemId, [...(groups.get(task.itemId) ?? []), task]);
  return [...groups.values()];
}

function validateEspFiles(input: EspGroupInput): string | null {
  const raster = input.tasks.find((t) => t.format === "raster");
  const vector = input.tasks.find((t) => t.format === "eps");
  if (!raster || !/\.jpe?g$/i.test(raster.fileName) || input.tasks.some((t) => t.format !== "raster" && t.format !== "eps")) {
    return "Getty ESP requires a JPEG and optional EPS; SVG, PNG and ZIP are not supported.";
  }
  if (input.missing.some((m) => m.itemId === raster.itemId && (m.format === "raster" || m.format === "eps"))) {
    return "A selected Getty illustration file is missing; no part was uploaded.";
  }
  if (vector && raster.fileName.replace(/\.jpe?g$/i, "") !== vector.fileName.replace(/\.eps$/i, "")) {
    return "Getty EPS and JPEG must have matching filenames.";
  }
  return null;
}

async function readEspFiles(input: EspGroupInput): Promise<BridgeUploadInput | null> {
  const raster = input.tasks.find((t) => t.format === "raster")!;
  const vector = input.tasks.find((t) => t.format === "eps");
  const jpeg = raster.relPath ? await readBytesAt(input.root, raster.relPath) : null;
  const eps = vector?.relPath ? await readBytesAt(input.root, vector.relPath) : null;
  if (!jpeg?.byteLength || (vector && !eps?.byteLength)) return null;
  return {
    bridgeUrl: input.bridgeUrl, preset: input.target, creds: input.creds, fileName: raster.fileName, bytes: jpeg,
    pairedFile: vector && eps ? { fileName: vector.fileName, bytes: eps } : undefined,
    sessionKey: input.sessionKey, signal: input.signal,
  };
}

export async function uploadEspGroup(input: EspGroupInput): Promise<BridgeUploadResult> {
  const reason = validateEspFiles(input);
  if (reason) return { ok: false, code: "bad-request", reason, serverCertSha256: null };
  const payload = await readEspFiles(input);
  if (!payload) return { ok: false, code: "bad-request", reason: "Getty illustration file could not be read.", serverCertSha256: null };
  if (input.combine) {
    if (!input.item) return { ok: false, code: "bad-request", reason: "Item no longer present", serverCertSha256: null };
    try {
      payload.bytes = await prepareMetadataCopy(input.item, payload.fileName, payload.bytes);
      if (payload.pairedFile) payload.pairedFile.bytes = await prepareMetadataCopy(input.item, payload.pairedFile.fileName, payload.pairedFile.bytes);
    } catch (err) {
      return { ok: false, code: "bad-request", reason: (err as Error).message || "Could not prepare upload metadata", serverCertSha256: null };
    }
  }
  return (input.uploadFn ?? uploadBridgeFtps)(payload);
}
