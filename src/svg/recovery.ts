// recovery.ts — promote a validated orphan temp to its version name without
// overwriting; approval, source fingerprint and renderability are rechecked.

import { nameExists, probePath, tryGetFile, type DirHandleLike } from "../lib/fs";
import { renderedSvgHasInk, sanitizeSvg } from "../lib/svgvalidate";
import { isSourceStillApproved } from "./run/checkpoint";
import { findSvgFiles, svgFileName, type SvgFileEntry } from "./files";
import { notifySvgChanges } from "./events";
import { loadSidecar } from "./sidecar";
import type { SvgRequestRecord, SvgSourceRow } from "./types";

type SvgRecoveryResult = "saved" | "not-found" | "invalid" | "not-approved" | "conflict" | "unsupported";

interface RecoveryTemp {
  entry: SvgFileEntry;
  parent: DirHandleLike;
  handle: Awaited<ReturnType<DirHandleLike["getFileHandle"]>>;
}

export async function retryRecoverableSvg(root: DirHandleLike, row: SvgSourceRow): Promise<SvgRecoveryResult> {
  const candidate = await locateTemp(root, row);
  if (!candidate) return "not-found";
  if (!await hasCurrentApproval(root, row)) return "not-approved";
  if (!await validTemporary(candidate, row.filename)) return "invalid";
  return promoteTemporary(candidate, row);
}

async function locateTemp(root: DirHandleLike, row: SvgSourceRow): Promise<RecoveryTemp | null> {
  const entry = (await findSvgFiles(root, row.relativePath)).find((file) => file.temporary && file.path === row.recoverableTempPath);
  if (!entry) return null;
  const parent = await probePath(root, row.relativePath.split("/").slice(0, -1).join("/"));
  const handle = parent ? await tryGetFile(parent, entry.name) : null;
  return parent && handle ? { entry, parent, handle } : null;
}

async function hasCurrentApproval(root: DirHandleLike, row: SvgSourceRow): Promise<boolean> {
  const loaded = await loadSidecar(root, row.sourceId, row.relativePath);
  const request = loaded.state === "ok" ? latestSourceRequest(loaded.value.requests, row.sourceId, row.sourceFingerprint) : null;
  const manifest = request?.manifest.find((item) => item.sourceId === row.sourceId && item.fingerprint === row.sourceFingerprint);
  return Boolean(manifest && await isSourceStillApproved(root, manifest));
}

function latestSourceRequest(requests: SvgRequestRecord[], sourceId: string, fingerprint: string) {
  return requests.slice().reverse().find((request) => request.manifest.some((item) =>
    item.sourceId === sourceId && item.fingerprint === fingerprint)) ?? null;
}

async function validTemporary(candidate: RecoveryTemp, title: string): Promise<boolean> {
  const checked = sanitizeSvg(await (await candidate.handle.getFile()).text(), title);
  return checked.ok && await renderedSvgHasInk(checked.svg);
}

async function promoteTemporary(candidate: RecoveryTemp, row: SvgSourceRow): Promise<SvgRecoveryResult> {
  const finalName = svgFileName(row.filename, candidate.entry.version);
  if (await nameExists("file", candidate.parent, finalName)) return "conflict";
  if (!candidate.handle.move) return "unsupported";
  try { await candidate.handle.move(finalName); }
  catch { return "conflict"; }
  notifySvgChanges();
  return "saved";
}
