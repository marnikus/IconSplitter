// runlog.ts — the Generate SVG tab's log vocabulary (feature §3). Owns: turning
// every `RunEvent` into the one safe entry the global log keeps, so the log and
// the run strip read the SAME event stream and cannot disagree about what was
// sent, retried, failed, cost or was saved.
//
// Two mappers, split by responsibility (RULE 19 step 2 — no branch ladder):
// stage events describe the run and its requests, item events describe one
// image inside a request. Neither copies the composite data URL the events
// carry for the UI: the log keeps the hash, never the bytes.
//
// Differences from the branch this was ported from (2026-10-05-global-log §2 /
// §3.1): this branch streams, so an outcome may be *unconfirmed* (a stall) —
// that is a warning with its own wording, never an error, because nobody has
// confirmed a failure; and the entry names the provider request id only when
// the outcome really carries one (`BatchOutcome.requestId`), never a guess.

import { fmtTokens, costLabel } from "../lib/svgusage";
import type { LogSpec } from "../lib/log";
import { log } from "../log/logstore";
import type { RunEvent } from "./runtypes";

const FEATURE = "svg";

/** Run-level events: the run, its requests, and a cancellation. */
type StageEvent = Extract<RunEvent, { kind: "run-start" | "batch-start" | "batch-done" | "cancelled" }>;

/** Per-image and per-request-failure events. */
type ItemEvent = Extract<
  RunEvent,
  { kind: "item-start" | "item-saved" | "item-failed" | "request-retry" | "request-failed" }
>;

export function runLogSpecs(event: RunEvent): LogSpec[] {
  return isItemEvent(event) ? itemSpecs(event) : stageSpecs(event);
}

/**
 * Wraps the runner's event sink: the live UI gets the event FIRST (so rows and
 * the batch strip update in the same turn), then the global log records it.
 * One wrapper means a new event kind cannot be wired to the log by accident.
 */
export function withRunLog(sink: (event: RunEvent) => void): (event: RunEvent) => void {
  return (event) => {
    sink(event);
    for (const spec of runLogSpecs(event)) log(spec);
  };
}

function isItemEvent(event: RunEvent): event is ItemEvent {
  return event.kind.startsWith("item-") || event.kind === "request-retry" || event.kind === "request-failed";
}

function stageSpecs(event: StageEvent): LogSpec[] {
  switch (event.kind) {
    case "run-start":
      return [stage("run-start", `starting ${event.batches} request(s), up to ${event.perRequest} icon(s) each`,
        { batches: event.batches, perRequest: event.perRequest, images: event.images })];
    case "batch-start":
      return [stage("request-start", `request ${event.index} of ${event.batches} — ${event.count} image(s) in a ${event.cols}×${event.rows} grid`,
        { request: event.index, batches: event.batches, images: event.count, runImages: event.images, grid: `${event.cols}×${event.rows}`, composite: event.hash },
        { batch: event.batchId })];
    case "batch-done":
      return [requestDone(event)];
    case "cancelled":
      return [{ level: "warn", feature: FEATURE, action: "cancelled", detail: "the run was cancelled — finished results are kept" }];
  }
}

/** One finished request: counts, tokens, the one cost decision, and its outcome. */
function requestDone(event: Extract<RunEvent, { kind: "batch-done" }>): LogSpec {
  const r = event.report;
  const detail = `request ${r.index} done — ${event.done} of ${event.images} image(s) done · ${r.saved} saved · ${r.failed} failed · ${r.missing} missing`
    + (r.error === null ? "" : ` — ${r.error}`)
    + (r.status === "unknown" ? " · outcome not confirmed; never retried" : "")
    + ` · ${fmtTokens(r.usage.total)} tokens · ${costLabel(r.cost)}`;
  return {
    level: r.status === "failed" ? "error" : r.status === "unknown" ? "warn" : "info",
    feature: FEATURE, action: "request-done",
    ids: { batch: r.id, ...(r.requestId === null ? {} : { request: r.requestId }) },
    detail,
    data: {
      request: r.index, images: r.count, runImages: event.images, done: event.done, saved: r.saved, failed: r.failed, missing: r.missing,
      status: r.status, tokens: r.usage.total, cost: r.usage.cost,
      elapsedMs: r.elapsedMs, requestId: r.requestId,
    },
  };
}

function itemSpecs(event: ItemEvent): LogSpec[] {
  switch (event.kind) {
    case "item-start":
      return [{ level: "debug", feature: FEATURE, action: "item-start", ids: pair(event.batchId, event.sourceId), data: { position: event.position } }];
    case "item-saved":
      return [{
        feature: FEATURE, action: "item-saved", ids: pair(event.batchId, event.sourceId),
        detail: `saved ${event.version === 1 ? "the first version" : `version ${event.version}`} — ${event.icons} icon(s), ${fmtTokens(event.usage.total)} tokens`,
        data: { position: event.position, version: event.version, icons: event.icons, tokens: event.usage.total, cost: event.usage.cost },
      }];
    case "item-failed":
      return [{
        level: "error", feature: FEATURE, action: "item-failed", ids: pair(event.batchId, event.sourceId),
        detail: event.error,
        data: { position: event.position, failure: event.failure, retryAfterMs: event.retryAfterMs },
      }];
    case "request-retry":
      return [{
        level: "warn", feature: FEATURE, action: "request-retry", ids: { batch: event.batchId },
        detail: `attempt ${event.attempt} of ${event.retries + 1} failed (${event.failure}) — retrying in ${Math.round(event.delayMs / 1000)}s`,
        data: { attempt: event.attempt, retries: event.retries, failure: event.failure, status: event.status, delayMs: event.delayMs },
      }];
    case "request-failed":
      return [{
        level: "error", feature: FEATURE, action: "request-failed", ids: { batch: event.batchId },
        detail: event.error,
        data: { failure: event.failure, images: event.count, retryAfterMs: event.retryAfterMs },
      }];
  }
}

function pair(batchId: string, sourceId: string): Record<string, string> {
  return { batch: batchId, source: sourceId };
}

function stage(action: string, detail: string, data: Record<string, unknown>, ids?: Record<string, string>): LogSpec {
  return { feature: FEATURE, action, detail, data, ...(ids === undefined ? {} : { ids }) };
}
