// sidecar.ts — one per-AI-file version history, stored beside its source image.
// Missing means pending. Corrupt data is reported, never overwritten or deleted.

import { probePath, tryGetFile, writeFileNew, writeFileOverwrite, type DirHandleLike } from "../lib/fs";
import { safeErrorText } from "./security";
import { containsCredential } from "./prefs";
import { parseSvgSidecar } from "./sidecar.parse";
export { parseSvgSidecar } from "./sidecar.parse";
import type { SvgRequestRecord, SvgSidecar, SvgVersionRecord } from "./types";

type SidecarLoad =
  | { state: "missing"; value: null }
  | { state: "ok"; value: SvgSidecar }
  | { state: "corrupt"; value: null };

export function sidecarName(sourcePath: string): string {
  return `${sourcePath.split("/").pop()}.svg.json`;
}

export function emptySidecar(sourceId: string, sourcePath: string, fingerprint: string, now: string): SvgSidecar {
  return { schemaVersion: 1, sourceId, sourcePath, sourceFingerprint: fingerprint,
    requests: [], versions: [], lastSafeError: null, updatedAt: now };
}

export async function loadSidecar(root: DirHandleLike, sourceId: string, sourcePath: string): Promise<SidecarLoad> {
  const parent = await sourceFolder(root, sourcePath);
  if (!parent) return { state: "corrupt", value: null };
  const handle = await tryGetFile(parent, sidecarName(sourcePath));
  if (!handle) return { state: "missing", value: null };
  try {
    const parsed = parseSvgSidecar(await (await handle.getFile()).text(), sourceId, sourcePath);
    return parsed ? { state: "ok", value: parsed } : { state: "corrupt", value: null };
  } catch {
    return { state: "corrupt", value: null };
  }
}

export async function saveSidecar(root: DirHandleLike, sidecar: SvgSidecar): Promise<void> {
  const parent = await sourceFolder(root, sidecar.sourcePath);
  if (!parent) throw new Error("Source folder is unavailable; sidecar was not saved.");
  const name = sidecarName(sidecar.sourcePath);
  const tempName = `.${name}.tmp-${randomSuffix()}`;
  const safe = safeSidecarForStorage(sidecar);
  const text = JSON.stringify(safe, null, 2);
  try {
    await stageSidecar(parent, tempName, text);
    await verifyStagedSidecar(parent, tempName, sidecar, text);
    await writeFileOverwrite(parent, name, new Blob([text], { type: "application/json" }));
  } finally {
    try { await parent.removeEntry?.(tempName); } catch { /* an interrupted temp is recoverable metadata */ }
  }
}

function safeSidecarForStorage(sidecar: SvgSidecar): SvgSidecar {
  const safe: SvgSidecar = {
    ...sidecar, lastSafeError: safeErrorText(sidecar.lastSafeError),
    requests: sidecar.requests.map((request) => ({ ...request, safeError: safeErrorText(request.safeError) })),
    versions: sidecar.versions.map((version) => ({ ...version,
      validation: { ...version.validation, safeError: safeErrorText(version.validation.safeError) } })),
  };
  if (containsCredential(JSON.stringify(safe))) throw new Error("Credential-like text was blocked from sidecar storage.");
  return safe;
}

async function stageSidecar(parent: DirHandleLike, name: string, text: string): Promise<void> {
  await writeFileNew(parent, name, new Blob([text], { type: "application/json" }));
}

async function verifyStagedSidecar(parent: DirHandleLike, name: string, sidecar: SvgSidecar, expected: string): Promise<void> {
  const handle = await tryGetFile(parent, name);
  const actual = handle ? await (await handle.getFile()).text() : null;
  if (actual !== expected || !parseSvgSidecar(actual, sidecar.sourceId, sidecar.sourcePath)) {
    throw new Error("Temporary sidecar verification failed.");
  }
}

function randomSuffix(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function recoverInterrupted(sidecar: SvgSidecar, now: string, isRunning: (sourceId: string) => boolean = () => false): SvgSidecar {
  let changed = false;
  const requests = sidecar.requests.map((request) => {
    if (request.status !== "in-progress" || request.manifest.some((item) => isRunning(item.sourceId))) return request;
    changed = true;
    return { ...request, status: "unknown" as const, finishedAt: now,
      safeError: "App restarted during generation; request outcome is unknown. Check Requesty before retrying." };
  });
  return changed ? { ...sidecar, requests, updatedAt: now } : sidecar;
}

export function upsertRequest(sidecar: SvgSidecar, request: SvgRequestRecord, now: string): SvgSidecar {
  const requests = sidecar.requests.filter((item) => item.clientRequestId !== request.clientRequestId);
  return { ...sidecar, requests: [...requests, request], updatedAt: now, lastSafeError: request.safeError };
}

export function appendVersion(sidecar: SvgSidecar, version: SvgVersionRecord, now: string): SvgSidecar {
  return { ...sidecar, versions: [...sidecar.versions, version], sourceFingerprint: version.sourceFingerprint,
    updatedAt: now, lastSafeError: null };
}

async function sourceFolder(root: DirHandleLike, sourcePath: string): Promise<DirHandleLike | null> {
  const parentPath = sourcePath.split("/").slice(0, -1).join("/");
  return probePath(root, parentPath);
}
