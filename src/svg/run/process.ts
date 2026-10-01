// run/process.ts — durable checkpoint, one explicit Requesty call, then response handling.
// Uncertain outcomes are recorded and never automatically resubmitted.

import type { RequestOutcome, RequestInput } from "../requesty";
import { callRequesty } from "../requesty";
import { createCheckpoint, type CheckpointItem } from "./checkpoint";
import { notifySvgChanges } from "../events";
import { isSvgSourceRunning, releaseSources, reserveSources } from "./registry";
import { finishFailedBatch, processSuccessfulBatch, rejectedBatch } from "./response";
import type { RunBatchInput, RunBatchResult } from "./types";

export type { RunBatchInput, RunBatchResult } from "./types";

export async function runSvgBatch(input: RunBatchInput): Promise<RunBatchResult> {
  if (input.batch.manifest.some((item) => isSvgSourceRunning(item.sourceId))) {
    return rejectedBatch(input.batch, "Duplicate generation request prevented.");
  }
  const ids = input.batch.manifest.map((item) => item.sourceId);
  reserveSources(ids);
  try { return await runReservedBatch(input); }
  finally { releaseSources(ids); notifySvgChanges(); }
}

async function runReservedBatch(input: RunBatchInput): Promise<RunBatchResult> {
  input.onStage?.("Saving per-file request checkpoints…");
  const checkpoint = await createCheckpoint({ root: input.root, batch: input.batch, prefs: input.prefs, now: new Date().toISOString() });
  if (!checkpoint.ok) return rejectedBatch(input.batch, checkpoint.safeError);
  input.onStage?.(`Request ${checkpoint.clientRequestId} sent to Requesty…`);
  const response = await callRequesty(requestFor(input));
  return handleResponse(input, checkpoint.items, checkpoint.clientRequestId, response);
}

function requestFor(input: RunBatchInput): RequestInput {
  return {
    config: {
      baseUrl: input.prefs.baseUrl, model: input.prefs.model, timeoutMs: input.prefs.timeoutMs,
      rateLimitRetries: input.prefs.rateLimitRetries, maxOutputTokens: input.prefs.maxOutputTokens,
    },
    key: input.key, manifest: input.batch.manifest, prompt: input.prefs.prompt,
    compositeDataUrl: input.batch.compositeDataUrl,
  };
}

function handleResponse(
  input: RunBatchInput, items: CheckpointItem[], clientId: string, response: RequestOutcome,
): Promise<RunBatchResult> {
  if (response.kind === "success") return processSuccessfulBatch(input, items, clientId, response);
  return finishFailedBatch(input, items, clientId, response);
}
