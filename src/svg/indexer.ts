// indexer.ts — approved-source rescan, sidecar recovery and safe SVG previews.
// The Selection decision file remains the sole eligibility authority.

import type { DirHandleLike } from "../lib/fs";
import type { ViewPair } from "../lib/reviewfilter";
import { stableSvgSourceId } from "./prompt";
import { findRecoverableTemp, loadSvgVersions } from "./versionindex";
import { emptySidecar, loadSidecar, recoverInterrupted, saveSidecar, sidecarName } from "./sidecar";
import { isSvgSourceRunning } from "./run/registry";
import type { SvgLoadedVersion, SvgRequestRecord, SvgSidecar, SvgSourceRow, SvgVersionRecord } from "./types";

interface IndexSourceInput {
  root: DirHandleLike;
  pair: ViewPair;
  fingerprint: string;
  now: string;
}

type SidecarState = "missing" | "ok" | "corrupt";

interface RestoreMetadataInput {
  input: IndexSourceInput;
  sourceId: string;
  state: SidecarState;
  sidecar: SvgSidecar | null;
  versions: SvgLoadedVersion[];
}

interface MakeRowInput extends RestoreMetadataInput {
  sidecarState: SvgSourceRow["sidecarState"];
  recovery: string | null;
  recoveryError: string | null;
}

export async function indexApprovedSource(input: IndexSourceInput): Promise<SvgSourceRow | null> {
  if (input.pair.decision !== "approved" || !input.pair.ai) return null;
  const sourcePath = input.pair.ai.relPath;
  const sourceId = stableSvgSourceId(sourcePath);
  const loaded = await loadSidecar(input.root, sourceId, sourcePath);
  const sidecar = await recoverIfNeeded(input, loaded);
  const versions = await loadSvgVersions({ root: input.root, sourcePath, fingerprint: input.fingerprint,
    records: sidecar?.versions ?? [], requests: sidecar?.requests ?? [] });
  const restored = await restoreOrphanVersionMetadata({ input, sourceId, state: loaded.state, sidecar, versions });
  const recovery = await findRecoverableTemp(input.root, sourcePath);
  return makeRow({ input, sourceId, state: loaded.state, sidecar: restored.sidecar, versions,
    sidecarState: restored.state, recovery, recoveryError: restored.error });
}

async function recoverIfNeeded(input: IndexSourceInput, loaded: Awaited<ReturnType<typeof loadSidecar>>) {
  if (loaded.state !== "ok" || !loaded.value) return null;
  const next = recoverInterrupted(loaded.value, input.now, isSvgSourceRunning);
  if (next === loaded.value) return loaded.value;
  try { await saveSidecar(input.root, next); }
  catch { /* Keep unknown in memory even when recovery metadata cannot be rewritten. */ }
  return next;
}

async function restoreOrphanVersionMetadata(input: RestoreMetadataInput): Promise<{
  sidecar: SvgSidecar | null; state: SvgSourceRow["sidecarState"]; error: string | null;
}> {
  if (input.state === "corrupt") return { sidecar: input.sidecar, state: "corrupt", error: null };
  const additions = recoveredAdditions(input.versions, input.sidecar);
  if (additions.length === 0) return { sidecar: input.sidecar, state: input.state, error: null };
  const next = appendRecoveredVersions(input, additions);
  try {
    await saveSidecar(input.input.root, next);
    return { sidecar: next, state: "ok", error: null };
  } catch {
    return { sidecar: next, state: "write-failed", error: "Recovered SVG metadata could not be saved. Retry the rescan before reviewing or generating." };
  }
}

function recoveredAdditions(versions: SvgLoadedVersion[], sidecar: SvgSidecar | null): SvgLoadedVersion[] {
  const known = new Set(sidecar?.versions.map((version) => version.path) ?? []);
  return versions.filter((version) => version.recovered && version.available && !known.has(version.path));
}

function appendRecoveredVersions(input: RestoreMetadataInput, versions: SvgLoadedVersion[]): SvgSidecar {
  const { sourceId, input: source } = input;
  const base = input.sidecar ?? emptySidecar(sourceId, source.pair.ai?.relPath ?? "", source.fingerprint, source.now);
  return { ...base, versions: [...base.versions, ...versions.map(toVersionRecord)],
    sourceFingerprint: source.fingerprint, updatedAt: source.now };
}

function toVersionRecord(version: SvgLoadedVersion): SvgVersionRecord {
  return { version: version.version, path: version.path, sourceFingerprint: version.sourceFingerprint,
    prompt: version.prompt, provider: version.provider, model: version.model, createdAt: version.createdAt,
    review: version.review, reviewedAt: version.reviewedAt, requestId: version.requestId,
    batchId: version.batchId, positionId: version.positionId, compositeHash: version.compositeHash,
    manifest: version.manifest, usage: version.usage, costAllocation: version.costAllocation,
    contentHash: version.contentHash, validation: version.validation };
}

function makeRow(input: MakeRowInput): SvgSourceRow {
  const available = availableVersions(input.versions);
  const current = currentVersion(available);
  const newest = newestVersion(available);
  const requests = input.sidecar?.requests ?? [];
  const latest = latestForSource(requests, input.sourceId, input.input.fingerprint);
  const generation = resolveGeneration({ state: input.sidecarState, current, newest, latest, recovery: input.recovery });
  return {
    sourceId: input.sourceId, pairId: input.input.pair.pairId, ...sourceLocation(input),
    sourceFingerprint: input.input.fingerprint, sidecarState: input.sidecarState, generation,
    review: versionReview(newest, current), requests, versions: input.versions,
    newestSvg: newest?.svg ?? null, newestPath: newest?.path ?? null, newestVersion: newest?.version ?? null,
    safeError: rowError(input, generation, latest, newest), recoverableTempPath: input.recovery,
  };
}

function availableVersions(versions: SvgLoadedVersion[]): SvgLoadedVersion[] {
  return versions.filter((version) => version.available && version.svg);
}

function currentVersion(versions: SvgLoadedVersion[]): SvgLoadedVersion | null {
  return versions.filter((version) => version.sourceCurrent).at(-1) ?? null;
}

function newestVersion(versions: SvgLoadedVersion[]): SvgLoadedVersion | null {
  return versions.at(-1) ?? null;
}

function sourceLocation(input: MakeRowInput) {
  const path = input.input.pair.ai?.relPath ?? "";
  return { filename: path.split("/").pop() ?? input.input.pair.base,
    relativePath: path, sidecarPath: joinPath(path, sidecarName(path)) };
}

function versionReview(newest: SvgLoadedVersion | null, current: SvgLoadedVersion | null): SvgLoadedVersion["review"] {
  return newest?.review ?? current?.review ?? "pending";
}

function rowError(
  input: MakeRowInput, generation: SvgSourceRow["generation"],
  latest: SvgRequestRecord | null, newest: SvgLoadedVersion | null,
): string | null {
  const metadataError = input.sidecar?.lastSafeError ?? latest?.safeError ?? null;
  return input.recoveryError ?? generationError(generation, metadataError, input.recovery, newest);
}

interface GenerationStateInput {
  state: SvgSourceRow["sidecarState"];
  current: SvgLoadedVersion | null;
  newest: SvgLoadedVersion | null;
  latest: SvgRequestRecord | null;
  recovery: string | null;
}

function resolveGeneration(input: GenerationStateInput): SvgSourceRow["generation"] {
  if (input.state === "corrupt") return "corrupt";
  if (input.recovery) return "recoverable";
  if (input.current?.recovered) return "recovered";
  const requestState = requestGeneration(input.latest);
  if (requestState) return requestState;
  if (input.current) return "generated";
  if (input.newest && input.state === "missing") return "recovered";
  return "pending";
}

function requestGeneration(latest: SvgRequestRecord | null): SvgSourceRow["generation"] | null {
  if (!latest) return null;
  if (latest.status === "unknown") return "unknown";
  if (latest.status === "failed" || latest.status === "partial") return "failed";
  if (latest.status !== "in-progress") return null;
  return latest.manifest.some((item) => isSvgSourceRunning(item.sourceId)) ? "generating" : "unknown";
}

function latestForSource(requests: SvgRequestRecord[], sourceId: string, fingerprint: string): SvgRequestRecord | null {
  return requests.slice().reverse().find((request) => request.manifest.some((item) =>
    item.sourceId === sourceId && item.fingerprint === fingerprint)) ?? null;
}

function generationError(
  generation: SvgSourceRow["generation"], error: string | null, recovery: string | null, newest: SvgLoadedVersion | null,
): string | null {
  if (recovery) return "A validated SVG is retained in a temporary file; retry the atomic save.";
  if (generation === "corrupt") return "Sidecar metadata is corrupt. Existing SVG files were preserved.";
  if (generation === "unknown") return error ?? "Request outcome is unknown; check Requesty before retrying.";
  if (newest && !newest.sourceCurrent) return "The AI source changed; preview is from an older fingerprint.";
  return error;
}

function joinPath(sourcePath: string, filename: string): string {
  const slash = sourcePath.lastIndexOf("/");
  return slash < 0 ? filename : `${sourcePath.slice(0, slash)}/${filename}`;
}
