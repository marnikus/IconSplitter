// run/response.ts — map each provider item, validate SVG, and persist results.

import { sha256Hex } from "../../lib/svgcomposite";
import { distinctIconWarning, renderedSvgHasInk, sanitizeSvg } from "../../lib/svgvalidate";
import type { RequestOutcome } from "../requesty";
import { mapSvgResponse, type MappingResult } from "../responsemap";
import { appendVersion, loadSidecar, saveSidecar, upsertRequest } from "../sidecar";
import { atomicSaveSvg, nextSvgVersion } from "../files";
import { safeErrorText } from "../security";
import type { SvgBatchSummary, SvgManifestItem, SvgRequestRecord, SvgUsage, SvgVersionRecord } from "../types";
import type { PreparedBatch } from "../preflight";
import { isSourceStillApproved, type CheckpointItem } from "./checkpoint";
import type { RunBatchInput, RunBatchResult } from "./types";

interface ItemResult {
  positionId: number;
  state: "saved" | "invalid" | "missing" | "failed";
  version: SvgVersionRecord | null;
  safeError: string | null;
  recoverablePath: string | null;
}

interface InspectedItem {
  positionId: number;
  svg: string | null;
  validation: ReturnType<typeof sanitizeSvg> | null;
  state: "valid" | "invalid" | "missing";
  error: string | null;
}

type SuccessfulResponse = Extract<RequestOutcome, { kind: "success" }>;

interface BatchSaveContext {
  input: RunBatchInput;
  checkpoints: CheckpointItem[];
  clientRequestId: string;
  response: SuccessfulResponse;
}

interface ItemSaveContext {
  input: RunBatchInput;
  clientRequestId: string;
  response: SuccessfulResponse;
}

interface VersionRecordInput extends ItemSaveContext {
  entry: SvgManifestItem;
  path: string;
  version: number;
  checked: InspectedItem;
}

interface SidecarFinishInput {
  input: RunBatchInput;
  checkpoints: CheckpointItem[];
  clientRequestId: string;
  response: RequestOutcome;
  itemResults: ItemResult[];
  state: RunBatchResult["state"];
}

interface FinishedRequestInput {
  request: SvgRequestRecord;
  clientRequestId: string;
  response: RequestOutcome;
  item: ItemResult;
  state: RunBatchResult["state"];
}

interface BatchResultDetails {
  clientRequestId: string;
  providerRequestId: string | null;
  state: RunBatchResult["state"];
  summary: SvgBatchSummary;
  usage: SvgUsage;
  warning: string | null;
  sidecarFailures: number;
  safeError: string | null;
}

const EMPTY_USAGE: SvgUsage = { inputTokens: null, outputTokens: null, totalTokens: null, actualCostUsd: null };

export async function finishFailedBatch(
  input: RunBatchInput, checkpoints: CheckpointItem[], clientId: string,
  response: Exclude<RequestOutcome, { kind: "success" }>,
): Promise<RunBatchResult> {
  const state = response.kind === "unknown" ? "unknown" : "failed";
  const itemResults = input.batch.manifest.map((item) => ({
    positionId: item.positionId, state: "failed" as const, version: null,
    safeError: response.safeError, recoverablePath: null,
  }));
  const persisted = await finishSidecars({ input, checkpoints, clientRequestId: clientId, response, itemResults, state });
  const summary = emptySummary();
  summary.failed = state === "failed" ? input.batch.rows.length : 0;
  summary.unknown = state === "unknown" ? input.batch.rows.length : 0;
  return result(input, { clientRequestId: clientId, providerRequestId: null, state, summary,
    usage: EMPTY_USAGE, warning: null, sidecarFailures: persisted, safeError: response.safeError });
}

export async function processSuccessfulBatch(
  input: RunBatchInput, checkpoints: CheckpointItem[], clientId: string, response: SuccessfulResponse,
): Promise<RunBatchResult> {
  input.onStage?.("Mapping each explicit position ID…");
  const mapping = mapSvgResponse(response.content, input.batch.manifest);
  const inspected = await inspectOutputs(mapping, input.batch.manifest);
  const warning = responseWarning(input.batch.manifest.length, inspected, mapping);
  const saved = await saveMappedOutputs({ input, checkpoints, clientRequestId: clientId, response }, inspected);
  saved.summary.invalid += extraInvalidOutputs(mapping);
  const state = isCompleteSummary(saved.summary, input.batch.rows.length) ? "complete" : "partial";
  const persisted = await finishSidecars({ input, checkpoints, clientRequestId: clientId, response,
    itemResults: saved.items, state });
  return result(input, { clientRequestId: clientId, providerRequestId: response.requestId, state,
    summary: saved.summary, usage: response.usage, warning, sidecarFailures: persisted, safeError: null });
}

function responseWarning(expected: number, inspected: InspectedItem[], mapping: MappingResult): string | null {
  const distinct = distinctIconWarning(expected, inspected.filter((item) => item.svg).map((item) => item.svg!));
  const rejected = mapping.issues.filter((issue) => issue.kind !== "missing").length;
  return [distinct, rejected ? `Rejected ${rejected} unmapped or invalid response item(s).` : null].filter(Boolean).join(" ") || null;
}

function extraInvalidOutputs(mapping: MappingResult): number {
  return mapping.issues.filter((issue) => issue.kind === "unknown" || issue.kind === "out-of-range" || issue.positionId === null).length;
}

function isCompleteSummary(summary: SvgBatchSummary, expected: number): boolean {
  return summary.successful === expected && summary.failed === 0 && summary.missing === 0 && summary.invalid === 0;
}

async function inspectOutputs(mapping: MappingResult, manifest: SvgManifestItem[]): Promise<InspectedItem[]> {
  const mapped = new Map(mapping.outputs.map((output) => [output.positionId, output]));
  return Promise.all(manifest.map(async (item) => {
    const output = mapped.get(item.positionId);
    if (!output) return unmappedItem(item.positionId, mapping);
    const validation = sanitizeSvg(output.svg, item.filename);
    if (!validation.ok) return invalidItem(item.positionId, validation.error);
    if (!await renderedSvgHasInk(validation.svg)) return invalidItem(item.positionId, "SVG did not render visible geometry.");
    return { positionId: item.positionId, svg: validation.svg, validation, state: "valid", error: null };
  }));
}

function unmappedItem(positionId: number, mapping: MappingResult): InspectedItem {
  const invalid = mapping.issues.some((issue) => issue.positionId === positionId && issue.kind !== "missing");
  return invalid ? invalidItem(positionId, "Mapped SVG failed its position or title contract.")
    : { positionId, svg: null, validation: null, state: "missing", error: "No SVG returned for this position." };
}

function invalidItem(positionId: number, error: string): InspectedItem {
  return { positionId, svg: null, validation: null, state: "invalid", error };
}

async function saveMappedOutputs(
  context: BatchSaveContext, inspected: InspectedItem[],
): Promise<{ items: ItemResult[]; summary: SvgBatchSummary }> {
  const summary = emptySummary();
  const items: ItemResult[] = [];
  for (const checked of inspected) {
    const checkpoint = context.checkpoints.find((item) => item.request.positionId === checked.positionId);
    const item = await saveOne(itemContext(context), checkpoint, checked);
    items.push(item);
    countResult(summary, item);
  }
  return { items, summary };
}

function itemContext(context: BatchSaveContext): ItemSaveContext {
  return { input: context.input, clientRequestId: context.clientRequestId, response: context.response };
}

async function saveOne(context: ItemSaveContext, checkpoint: CheckpointItem | undefined, checked: InspectedItem): Promise<ItemResult> {
  if (checked.state !== "valid" || !checked.svg || !checked.validation?.ok) return invalidSaveResult(checked);
  if (!checkpoint) return failedSaveResult(checked.positionId, "Source mapping checkpoint is unavailable.");
  const entry = context.input.batch.manifest.find((item) => item.positionId === checked.positionId)!;
  if (!await isSourceStillApproved(context.input.root, entry)) {
    return failedSaveResult(checked.positionId, "Source is no longer approved or changed; response was not saved.");
  }
  return persistOne(context, checkpoint, checked, entry);
}

function invalidSaveResult(checked: InspectedItem): ItemResult {
  const state = checked.state === "valid" ? "invalid" : checked.state;
  return { positionId: checked.positionId, state, version: null,
    safeError: checked.error ?? "SVG validation did not complete.", recoverablePath: null };
}

function failedSaveResult(positionId: number, safeError: string): ItemResult {
  return { positionId, state: "failed", version: null, safeError, recoverablePath: null };
}

async function persistOne(
  context: ItemSaveContext, checkpoint: CheckpointItem, checked: InspectedItem, entry: SvgManifestItem,
): Promise<ItemResult> {
  const version = await nextSvgVersion(context.input.root, entry.relativePath, checkpoint.sidecar.versions.map((item) => item.version));
  try {
    const saved = await atomicSaveSvg({ root: context.input.root, sourcePath: entry.relativePath,
      version, svg: checked.svg!, requestId: context.clientRequestId });
    if (!saved.saved) return { positionId: entry.positionId, state: "failed", version: null,
      safeError: "Validated SVG is recoverable, but atomic rename failed; older versions were preserved.",
      recoverablePath: saved.recoverableTempPath };
    const record = await versionRecord({ ...context, entry, path: saved.path, version: saved.version, checked });
    return { positionId: entry.positionId, state: "saved", version: record, safeError: null, recoverablePath: null };
  } catch {
    return failedSaveResult(entry.positionId, "Validated SVG could not be saved; previous versions were preserved.");
  }
}

async function versionRecord(input: VersionRecordInput): Promise<SvgVersionRecord> {
  const { input: run, entry, path, version, checked, clientRequestId, response } = input;
  const validation = checked.validation!;
  return {
    version, path, sourceFingerprint: entry.fingerprint, prompt: run.prefs.prompt,
    provider: "Requesty", model: run.prefs.model, createdAt: nowIso(), review: "pending", reviewedAt: null,
    requestId: clientRequestId, batchId: run.batch.batchId, positionId: entry.positionId,
    compositeHash: run.batch.compositeHash, manifest: run.batch.manifest, usage: response.usage,
    costAllocation: "shared-batch-not-allocated", contentHash: await sha256Hex(new Blob([checked.svg!])),
    validation: { valid: true, visible: true, viewBox: validation.ok ? validation.viewBox : null,
      warnings: validation.ok ? validation.warnings : [], safeError: null },
  };
}

async function finishSidecars(input: SidecarFinishInput): Promise<number> {
  let failures = 0;
  for (const checkpoint of input.checkpoints) {
    const item = input.itemResults.find((result) => result.positionId === checkpoint.request.positionId);
    if (!item) continue;
    if (await finishOneSidecar(input, checkpoint, item)) failures++;
  }
  return failures;
}

async function finishOneSidecar(input: SidecarFinishInput, checkpoint: CheckpointItem, item: ItemResult): Promise<boolean> {
  const loaded = await loadSidecar(input.input.root, checkpoint.sourceId, checkpoint.sourcePath);
  if (loaded.state === "corrupt") return true;
  const base = loaded.value ?? checkpoint.sidecar;
  const request = finishedRequest({ request: checkpoint.request, clientRequestId: input.clientRequestId,
    response: input.response, item, state: input.state });
  let next = upsertRequest(base, request, nowIso());
  if (item.version) next = appendVersion(next, item.version, nowIso());
  try { await saveSidecar(input.input.root, next); return false; }
  catch { return true; }
}

function finishedRequest(input: FinishedRequestInput): SvgRequestRecord {
  const providerId = input.response.kind === "success" ? input.response.requestId : null;
  const usage = input.response.kind === "success" ? input.response.usage : EMPTY_USAGE;
  const status = requestStatus(input.response, input.state, input.item);
  return { ...input.request, clientRequestId: input.clientRequestId, providerRequestId: providerId, status,
    finishedAt: nowIso(), usage, safeError: safeErrorText(input.item.safeError) };
}

function requestStatus(
  response: RequestOutcome, state: RunBatchResult["state"], item: ItemResult,
): SvgRequestRecord["status"] {
  if (response.kind === "unknown") return "unknown";
  if (state === "failed") return "failed";
  return item.state === "saved" ? "complete" : "partial";
}

function countResult(summary: SvgBatchSummary, item: ItemResult): void {
  if (item.state === "saved") summary.successful++;
  else if (item.state === "missing") summary.missing++;
  else if (item.state === "invalid") summary.invalid++;
  else summary.failed++;
}

function emptySummary(): SvgBatchSummary {
  return { successful: 0, failed: 0, missing: 0, invalid: 0, unknown: 0 };
}

export function rejectedBatch(batch: PreparedBatch, message: string): RunBatchResult {
  return {
    batchId: batch.batchId, clientRequestId: null, providerRequestId: null, state: "failed",
    summary: { successful: 0, failed: batch.rows.length, missing: 0, invalid: 0, unknown: 0 },
    usage: EMPTY_USAGE, warning: null, sidecarFailures: 0, safeError: safeErrorText(message),
  };
}

function result(input: RunBatchInput, details: BatchResultDetails): RunBatchResult {
  return { batchId: input.batch.batchId, ...details, safeError: safeErrorText(details.safeError) };
}

function nowIso(): string {
  return new Date().toISOString();
}
