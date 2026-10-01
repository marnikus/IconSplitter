// run/checkpoint.ts — re-validates approval/fingerprints and durably marks every
// per-file request in progress before a single network request may be sent.

import { probePath, tryGetFile, type DirHandleLike } from "../../lib/fs";
import { sha256Hex } from "../../lib/svgcomposite";
import { loadDecisions } from "../../selection/reviewstore";
import { batchPrompt, stableSvgSourceId } from "../prompt";
import { findSvgFiles } from "../files";
import { emptySidecar, loadSidecar, saveSidecar, upsertRequest } from "../sidecar";
import { safeErrorText } from "../security";
import type { SvgRequestRecord, SvgSidecar } from "../types";
import type { PreparedBatch } from "../preflight";
import type { SvgPreferences } from "../prefs";

export interface CheckpointItem {
  sourceId: string;
  sourcePath: string;
  sidecar: SvgSidecar;
  request: SvgRequestRecord;
}

type CheckpointResult =
  | { ok: true; items: CheckpointItem[]; startedAt: string; clientRequestId: string }
  | { ok: false; safeError: string };

interface CheckpointInput {
  root: DirHandleLike;
  batch: PreparedBatch;
  prefs: SvgPreferences;
  now: string;
}

export async function createCheckpoint(input: CheckpointInput): Promise<CheckpointResult> {
  const approvals = await approvedIds(input.root);
  if (!approvals) return { ok: false, safeError: "Could not verify Selection decisions; no request was sent." };
  const items: CheckpointItem[] = [];
  const clientRequestId = randomId();
  try {
    await checkpointEntries(input, approvals, clientRequestId, items);
    return { ok: true, items, startedAt: input.now, clientRequestId };
  } catch (error) {
    await failStarted(input.root, items, input.now);
    return { ok: false, safeError: safeErrorText((error as Error).message) ?? "Could not create a durable generation checkpoint." };
  }
}

async function checkpointEntries(
  input: CheckpointInput, approvals: Set<string>, clientRequestId: string, items: CheckpointItem[],
): Promise<void> {
  for (const entry of input.batch.manifest) {
    items.push(await createCheckpointItem(input, approvals, entry, clientRequestId));
  }
}

async function createCheckpointItem(
  input: CheckpointInput, approvals: Set<string>, entry: PreparedBatch["manifest"][number], clientRequestId: string,
): Promise<CheckpointItem> {
  if (!await sourceIsApprovedAndCurrent(input.root, approvals, entry)) {
    throw new Error("An image is no longer approved or its source fingerprint changed; no request was sent.");
  }
  const loaded = await loadSidecar(input.root, entry.sourceId, entry.relativePath);
  if (loaded.state === "corrupt") throw new Error("SVG sidecar is corrupt; no request was sent.");
  if (await hasUntrackedSvgFiles(input.root, entry.relativePath, loaded.value)) {
    throw new Error("Existing SVG files lack durable version metadata; rescan and recover before generating.");
  }
  const sidecar = loaded.value ?? emptySidecar(entry.sourceId, entry.relativePath, entry.fingerprint, input.now);
  if (hasUnknown(sidecar, entry.sourceId, entry.fingerprint)) throw new Error("This image has an unknown request state; check Requesty before retrying.");
  return persistCheckpoint(input, entry, sidecar, clientRequestId);
}

async function sourceIsApprovedAndCurrent(
  root: DirHandleLike, approvals: Set<string>, entry: PreparedBatch["manifest"][number],
): Promise<boolean> {
  return approvals.has(entry.sourceId) && await unchanged(root, entry.relativePath, entry.fingerprint);
}

async function persistCheckpoint(
  input: CheckpointInput, entry: PreparedBatch["manifest"][number], sidecar: SvgSidecar, clientRequestId: string,
): Promise<CheckpointItem> {
  const request = makeRequest(input, entry, clientRequestId);
  const next = { ...upsertRequest(sidecar, request, input.now), sourceFingerprint: entry.fingerprint };
  await saveSidecar(input.root, next);
  return { sourceId: entry.sourceId, sourcePath: entry.relativePath, sidecar: next, request };
}

export async function isSourceStillApproved(root: DirHandleLike, entry: PreparedBatch["manifest"][number]): Promise<boolean> {
  const approved = await approvedIds(root);
  return Boolean(approved?.has(entry.sourceId) && await unchanged(root, entry.relativePath, entry.fingerprint));
}

async function approvedIds(root: DirHandleLike): Promise<Set<string> | null> {
  try {
    const loaded = await loadDecisions(root);
    if (loaded.corrupt) return null;
    return new Set(loaded.records.filter((record) => record.decision === "approved" && record.ai_result)
      .map((record) => stableIdForPath(record.ai_result!)));
  } catch {
    return null;
  }
}

function stableIdForPath(path: string): string {
  return stableSvgSourceId(path);
}

async function unchanged(root: DirHandleLike, path: string, fingerprint: string): Promise<boolean> {
  const parent = await probePath(root, path.split("/").slice(0, -1).join("/"));
  const handle = parent ? await tryGetFile(parent, path.split("/").pop() ?? "") : null;
  return Boolean(handle && await sha256Hex(await handle.getFile()) === fingerprint);
}

async function hasUntrackedSvgFiles(root: DirHandleLike, sourcePath: string, sidecar: SvgSidecar | null): Promise<boolean> {
  const known = new Set(sidecar?.versions.map((version) => version.path) ?? []);
  return (await findSvgFiles(root, sourcePath)).some((file) => file.temporary || !known.has(file.path));
}

function hasUnknown(sidecar: SvgSidecar, sourceId: string, fingerprint: string): boolean {
  return sidecar.requests.some((request) => request.status === "unknown" || request.status === "in-progress"
    ? request.manifest.some((item) => item.sourceId === sourceId && item.fingerprint === fingerprint) : false);
}

function makeRequest(input: CheckpointInput, entry: PreparedBatch["manifest"][number], clientRequestId: string): SvgRequestRecord {
  const item = input.batch.manifest.find((manifest) => manifest.sourceId === entry.sourceId)!;
  return {
    clientRequestId, providerRequestId: null, batchId: input.batch.batchId,
    status: "in-progress", positionId: item.positionId, compositeHash: input.batch.compositeHash,
    manifest: input.batch.manifest, prompt: batchPrompt(input.batch.manifest, input.prefs.prompt),
    provider: "Requesty", model: input.prefs.model, startedAt: input.now, finishedAt: null,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, actualCostUsd: null },
    costAllocation: "shared-batch-not-allocated", safeError: null,
  };
}

async function failStarted(root: DirHandleLike, items: CheckpointItem[], now: string): Promise<void> {
  for (const item of items) {
    const request = { ...item.request, status: "failed" as const, finishedAt: now,
      safeError: "Generation checkpoint failed before the API request was sent." };
    try { await saveSidecar(root, upsertRequest(item.sidecar, request, now)); } catch { /* no request was sent */ }
  }
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `request-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
