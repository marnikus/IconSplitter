// versionindex.ts — read, validate and recover sibling SVG output versions.

import { probePath, tryGetFile, type DirHandleLike } from "../lib/fs";
import { renderedSvgHasInk, sanitizeSvg } from "../lib/svgvalidate";
import { sha256Hex } from "../lib/svgcomposite";
import { findSvgFiles } from "./files";
import { stableSvgSourceId } from "./prompt";
import type { SvgLoadedVersion, SvgRequestRecord, SvgVersionRecord } from "./types";

interface VersionLoadInput {
  root: DirHandleLike;
  sourcePath: string;
  fingerprint: string;
  records: SvgVersionRecord[];
  requests: SvgRequestRecord[];
}

interface SingleVersionInput extends VersionLoadInput {
  path: string;
  version: number;
  record: SvgVersionRecord | undefined;
}

interface RecoveredRecordInput {
  sourcePath: string;
  path: string;
  version: number;
  fingerprint: string;
  contentHash: string;
  viewBox: string;
  requests: SvgRequestRecord[];
}

export async function loadSvgVersions(input: VersionLoadInput): Promise<SvgLoadedVersion[]> {
  const files = await findSvgFiles(input.root, input.sourcePath);
  const records = new Map(input.records.map((record) => [record.path, record]));
  const versions = await Promise.all(files.filter((file) => !file.temporary).map((file) => loadVersion({
    ...input, path: file.path, version: file.version, record: records.get(file.path),
  })));
  return versions.filter((version): version is SvgLoadedVersion => version !== null).sort(byVersion);
}

async function loadVersion(input: SingleVersionInput): Promise<SvgLoadedVersion | null> {
  const file = await fileAt(input.root, input.path);
  if (!file) return missingVersion(input.record, input.fingerprint);
  const raw = await file.text();
  const checked = sanitizeSvg(raw, input.sourcePath.split("/").pop() ?? "");
  if (!checked.ok) return input.record ? invalidLoaded(input.record, input.fingerprint, checked.error) : null;
  const hash = await sha256Hex(new Blob([raw]));
  if (!await versionHasVisibleInk(checked.svg, input.record, hash)) {
    return input.record ? invalidLoaded(input.record, input.fingerprint, "SVG has no visible rendered geometry.") : null;
  }
  const metadata = input.record ?? recoveredRecord({ sourcePath: input.sourcePath, path: input.path,
    version: input.version, fingerprint: input.fingerprint, contentHash: hash, viewBox: checked.viewBox, requests: input.requests });
  return { ...metadata, svg: checked.svg, available: true, recovered: !input.record,
    sourceCurrent: metadata.sourceFingerprint === input.fingerprint,
    validation: { ...metadata.validation, valid: true, visible: true, viewBox: checked.viewBox, safeError: null } };
}

function byVersion(a: SvgLoadedVersion, b: SvgLoadedVersion): number {
  return a.version - b.version;
}

function missingVersion(record: SvgVersionRecord | undefined, fingerprint: string): SvgLoadedVersion | null {
  return record ? { ...record, svg: null, available: false, recovered: false,
    sourceCurrent: record.sourceFingerprint === fingerprint } : null;
}

async function versionHasVisibleInk(svg: string, record: SvgVersionRecord | undefined, hash: string): Promise<boolean> {
  if (record?.contentHash === hash && record.validation.visible) return true;
  return renderedSvgHasInk(svg);
}

function invalidLoaded(record: SvgVersionRecord, fingerprint: string, error: string): SvgLoadedVersion {
  return { ...record, svg: null, available: false, recovered: false,
    sourceCurrent: record.sourceFingerprint === fingerprint,
    validation: { ...record.validation, valid: false, visible: false, safeError: error } };
}

function recoveredRecord(input: RecoveredRecordInput): SvgVersionRecord {
  const request = latestSourceRequest(input.requests, input.sourcePath);
  const item = request?.manifest.find((entry) => entry.sourceId === stableSvgSourceId(input.sourcePath));
  return {
    version: input.version, path: input.path, sourceFingerprint: item?.fingerprint ?? input.fingerprint,
    ...recoveredRequestDetails(request), positionId: item?.positionId ?? 1,
    costAllocation: "shared-batch-not-allocated", contentHash: input.contentHash,
    validation: { valid: true, visible: true, viewBox: input.viewBox,
      warnings: ["Recovered SVG file; original version metadata was unavailable."], safeError: null },
  };
}

function recoveredRequestDetails(request: SvgRequestRecord | null) {
  if (!request) return emptyRecoveredRequestDetails();
  return {
    prompt: request.prompt, provider: "Requesty" as const, model: request.model,
    createdAt: request.finishedAt ?? new Date(0).toISOString(), review: "pending" as const, reviewedAt: null,
    requestId: request.clientRequestId, batchId: request.batchId, compositeHash: request.compositeHash,
    manifest: request.manifest, usage: request.usage,
  };
}

function emptyRecoveredRequestDetails() {
  return {
    prompt: "", provider: "Requesty" as const, model: "", createdAt: new Date(0).toISOString(),
    review: "pending" as const, reviewedAt: null, requestId: "recovered", batchId: "recovered",
    compositeHash: "", manifest: [], usage: emptyUsage(),
  };
}

function latestSourceRequest(requests: SvgRequestRecord[], sourcePath: string): SvgRequestRecord | null {
  const sourceId = stableSvgSourceId(sourcePath);
  return requests.slice().reverse().find((request) => request.manifest.some((item) => item.sourceId === sourceId)) ?? null;
}

export async function findRecoverableTemp(root: DirHandleLike, sourcePath: string): Promise<string | null> {
  const file = (await findSvgFiles(root, sourcePath)).find((item) => item.temporary);
  if (!file) return null;
  const handle = await fileAt(root, file.path);
  return handle && await isVisibleRecoveryTemp(handle, sourcePath) ? file.path : null;
}

async function isVisibleRecoveryTemp(handle: File, sourcePath: string): Promise<boolean> {
  const checked = sanitizeSvg(await handle.text(), sourcePath.split("/").pop() ?? "");
  return checked.ok && await renderedSvgHasInk(checked.svg);
}

async function fileAt(root: DirHandleLike, path: string): Promise<File | null> {
  const parent = await probePath(root, path.split("/").slice(0, -1).join("/"));
  const handle = parent ? await tryGetFile(parent, path.split("/").pop() ?? "") : null;
  return handle ? handle.getFile() : null;
}

function emptyUsage() {
  return { inputTokens: null, outputTokens: null, totalTokens: null, actualCostUsd: null };
}
