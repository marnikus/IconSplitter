// runlog.ts — what the Generate SVG tab tells the global log (log-contract.md §4,
// adapted to this branch's long-request runner). The runner and runbatch emit
// RunEvents and know nothing of the log (D8); this module is the tap: a TABLE
// from each event kind to one entry, plus the entries of the confirmation, the
// run, the key, the model and the rules. It only ever hands the log FACTS —
// counts, ids, hashes, the already-redacted reason. Never the key, the rules
// text, the contact sheet, a sidecar or an SVG; the redactor behind the log is
// the second line of defence, not the first.

import type { LogIds, LogInput, LogUsage } from "../lib/logentry";
import { fnv1a32 } from "../lib/pairing";
import type { Usage } from "../lib/svgrequest";
import { log, logger } from "../log/logger";
import type { RunEvent, RunSummary } from "./runner";
import { summaryLine } from "./runstate";
import type { Discovery } from "./sources";

export interface RunLogCtx {
  run: string;
  model: string;
}

type Part = Omit<LogInput, "feature">;
type Makers = { [K in RunEvent["kind"]]: (e: Extract<RunEvent, { kind: K }>, c: RunLogCtx) => Part | null };

/** Reported and calculated money stay in their own fields (I-18). */
const usageOf = (u: Usage): LogUsage => ({
  input: u.input, output: u.output, total: u.total, cost: u.cost, estimated: null, currency: u.currency,
});
const idsOf = (c: RunLogCtx, batch: string, more: LogIds = {}): LogIds => ({ run: c.run, batch, ...more });

const MAKERS: Makers = {
  "run-start": () => null, // confirm.accept/run.start carry it with the run id
  "batch-start": (e, c) => ({
    level: "info", action: "batch.start", message: `${e.batchId}: ${e.count} image(s) on a ${e.cols}×${e.rows} sheet`,
    ids: idsOf(c, e.batchId), data: { count: e.count, cols: e.cols, rows: e.rows, hash: e.hash },
  }),
  "request-sent": (e, c) => ({
    level: "info", action: "request.sent", message: `Sending ${e.batchId}, attempt ${e.attempt}/${e.of}`,
    ids: idsOf(c, e.batchId), data: { attempt: e.attempt, of: e.of, hash: e.hash, model: c.model },
  }),
  "request-ok": (e, c) => ({
    level: "info", action: "request.ok", message: `${e.batchId} answered ${e.status} in ${e.ms} ms`,
    ids: idsOf(c, e.batchId, e.requestId === null ? {} : { request: e.requestId }),
    data: { status: e.status, ms: e.ms, attempt: e.attempt }, usage: usageOf(e.usage),
  }),
  "request-retry": (e, c) => ({
    level: "warn", action: "request.retry", message: `${e.batchId}: ${e.failure} — retrying in ${e.waitMs} ms (attempt ${e.attempt}/${e.of})`,
    ids: idsOf(c, e.batchId), data: { attempt: e.attempt, of: e.of, kind: e.failure, status: e.status, waitMs: e.waitMs, reason: e.error },
  }),
  "request-failed": (e, c) => ({
    level: "error", action: "request.failed", message: `${e.batchId} failed (${e.failure}): ${e.error}`,
    ids: idsOf(c, e.batchId, e.requestId === null ? {} : { request: e.requestId }),
    data: { kind: e.failure, retryAfterMs: e.retryAfterMs, count: e.count, reason: e.error },
  }),
  "item-start": () => null,
  "item-saved": (e, c) => ({
    level: "info", action: "item.saved", message: `Position ${e.position} saved as version ${e.version}`,
    ids: idsOf(c, e.batchId, { source: e.sourceId }),
    data: { position: e.position, version: e.version, icons: e.icons, warnings: e.warnings.length }, usage: usageOf(e.usage),
  }),
  "item-failed": (e, c) => ({
    level: "error", action: "item.failed", message: `Position ${e.position} failed (${e.failure}): ${e.error}`,
    ids: idsOf(c, e.batchId, { source: e.sourceId }), data: { position: e.position, kind: e.failure, reason: e.error },
  }),
  "batch-done": (e, c) => ({
    level: e.report.status === "done" && e.report.missing === 0 ? "info" : "warn", action: "batch.done",
    message: `${e.report.id}: ${e.report.saved} saved, ${e.report.failed} failed, ${e.report.missing} missing`
      + (e.report.status === "unknown" ? " — outcome unknown" : ""),
    ids: idsOf(c, e.report.id), data: { saved: e.report.saved, failed: e.report.failed, missing: e.report.missing },
  }),
  cancelled: () => null, // the user's Cancel and the run's end already say it
};

/** One RunEvent → one entry (or none). Pure: this is the table under test. */
export function runEventInput(event: RunEvent, c: RunLogCtx): LogInput | null {
  const part = (MAKERS[event.kind] as (e: RunEvent, ctx: RunLogCtx) => Part | null)(event, c);
  return part === null ? null : { feature: "svg", ...part };
}

/** The `onEvent` listener that mirrors a run into the log. */
export const tapRun = (c: RunLogCtx) => (event: RunEvent): void => {
  const input = runEventInput(event, c);
  if (input !== null) log(input);
};

const svg = logger("svg");

export function logConfirmOpen(selected: number, requests: number): void {
  svg.info("confirm.open", `Confirming ${selected} image(s) in ${requests} request(s)`, { data: { selected, requests } });
}

export function logConfirmCancel(selected: number): void {
  svg.info("confirm.cancel", "Confirmation dismissed — nothing was sent", { data: { selected } });
}

export function logConfirmAccept(run: string, selected: number, requests: number): void {
  svg.info("confirm.accept", `Confirmed ${selected} image(s) in ${requests} request(s)`, {
    ids: { run }, data: { selected, requests },
  });
}

export interface RunStartFacts {
  sources: number;
  requests: number;
  model: string;
  retries: number;
  timeoutMs: number;
}

export function logRunStart(run: string, f: RunStartFacts): void {
  svg.info("run.start", `Run started: ${f.sources} image(s), ${f.requests} request(s)`, {
    ids: { run }, data: { sources: f.sources, requests: f.requests, model: f.model, retries: f.retries, timeoutMs: f.timeoutMs },
  });
}

/** The end of a run: the one summary line, the counts and the money with its basis. */
export function logRunDone(run: string, s: RunSummary): void {
  const trouble = s.failed + s.invalid + s.missing > 0 || s.cancelled || s.unknown > 0;
  svg[trouble ? "warn" : "info"]("run.done", summaryLine(s), {
    ids: { run }, data: { saved: s.saved, failed: s.failed, missing: s.missing, invalid: s.invalid, cancelled: s.cancelled },
    usage: { ...usageOf(s.usage), estimated: s.estimated },
  });
}

export function logRunCancel(run: string | null): void {
  svg.warn("run.cancel", "Cancel requested — finished results are kept", run === null ? {} : { ids: { run } });
}

/** An edit of the generation rules: its LENGTH and a HASH, never the text. The keystrokes of one spell fold. */
export function logRulesEdit(text: string): void {
  const hash = fnv1a32(text).toString(16).padStart(8, "0");
  svg.info("rules.edit", `Generation rules edited (${text.length} characters)`, { data: { chars: text.length, hash }, fold: "svg.rules.edit" });
}

/** What a scan could use and what it could not. */
export function logScan(found: Discovery): void {
  const counts = { approved: found.sources.length, missing: found.problems.length, unreadable: found.unreadable.length, corrupt: found.corruptDecisions };
  const trouble = counts.missing + counts.unreadable > 0 || counts.corrupt;
  svg[trouble ? "warn" : "info"]("scan.done", `Scan found ${counts.approved} approved source(s)`, { data: counts });
}

/** Where a saved key landed — never the key. */
export function logKey(action: "save" | "clear", where?: "device" | "session"): void {
  if (action === "clear") return void svg.info("key.clear", "API key cleared from this device");
  svg[where === "device" ? "info" : "warn"]("key.save", `API key saved for ${where === "device" ? "this device" : "this session only"}`, { data: { where: where ?? "session" } });
}

export function logModelChange(model: string, reasoning: boolean, resetCount: number): void {
  svg[resetCount > 0 ? "warn" : "info"]("model.change", `Model changed to ${model}`, { data: { model, reasoning, resetCount } });
}
