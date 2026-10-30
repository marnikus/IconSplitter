// gettyretry.ts — "Retry not-ready files" on a finished Getty run: the batch is
// still open, so the open contributions are re-filled, re-saved and re-read in
// place. Nothing is re-attached, so a retry can never duplicate a contribution.

import { gettyWebStem } from "../lib/stockupload/gettyweb";
import { retryBridgeGettyWeb, type GettyWebRetryInput } from "../lib/stockupload/gettywebclient";
import type { GettyWebSuccess } from "../lib/stockupload/gettywebresult";
import type { FtpCredentials } from "../lib/stockupload/credvault";
import type { ExportedItem, StockFtpPreset, UploadFormatKey } from "../lib/stockupload/types";
import { assignNamedBadge, ensureHardcodedBadges } from "../lib/upload/rowbadge";
import { getRowBadgeState, setRowBadgeState } from "../upload/rowbadgestore";
import type { GettyWebRetryTarget, UploadProgressStep } from "./batchtypes";
import { recordSiteUploadStatus } from "./historystore";

/** What a retry reading is worth to the rows that were still open. */
export interface GettyRetryReading {
  ok: boolean;
  /** The helper answered at all: a refusal is a reason, not an outcome. */
  reached: boolean;
  reason: string;
  /** Stems Getty now marks "Ready to submit". */
  ready: string[];
  /** Stems still open, with the reason Getty's card gives. */
  open: Array<{ stem: string; reason: string }>;
}

function reasonOfOpen(truth: { name: string; state: string; picture: boolean }): string {
  if (truth.picture || truth.state === "arrived") {
    return `Getty has ${truth.name} but does not show "Ready to submit"`;
  }
  return `Getty does not show its "Ready to submit" icon for ${truth.name}`;
}

/** Reads a retry answer stem by stem; unreadable pages leave everything open. */
export function readingOf(res: GettyWebSuccess, names: readonly string[]): GettyRetryReading {
  const stems = [...new Set(names.map(gettyWebStem))];
  if (res.verified === false) {
    return {
      ok: false, reached: true, reason: "Getty's batch page could not be read — nothing was verified",
      ready: [], open: stems.map((stem) => ({ stem, reason: "not verified" })),
    };
  }
  const byStem = new Map((res.outcomes ?? []).map((truth) => [truth.stem, truth]));
  const ready: string[] = [];
  const open: Array<{ stem: string; reason: string }> = [];
  for (const stem of stems) {
    const truth = byStem.get(stem);
    if (truth?.state === "ready") ready.push(stem);
    else {
      open.push({
        stem,
        reason: truth === undefined
          ? `Getty does not list ${stem} any more`
          : reasonOfOpen(truth),
      });
    }
  }
  return { ok: open.length === 0, reached: true, reason: open[0]?.reason ?? "", ready, open };
}

/** Asks the open batch about the files the run left behind. */
export async function retryOpenGettyFiles(
  input: GettyWebRetryInput,
  retryFn: typeof retryBridgeGettyWeb = retryBridgeGettyWeb,
): Promise<GettyRetryReading> {
  const res = await retryFn(input);
  // No answer at all (helper gone, session closed): the rows stay exactly as they
  // were, and the bar keeps offering the retry.
  if (!res.ok) return { ok: false, reached: false, reason: res.reason, ready: [], open: [] };
  return readingOf(res, input.names);
}

function formatsOf(item: ExportedItem): UploadFormatKey[] {
  const keys: UploadFormatKey[] = [];
  if (item.files.raster) keys.push("raster");
  if (item.files.eps) keys.push("eps");
  if (item.files.svg) keys.push("svg");
  return keys;
}

function markUploaded(item: ExportedItem, target: StockFtpPreset, at: string): void {
  recordSiteUploadStatus(item.id, target.id, { status: "uploaded", formats: formatsOf(item), uploadedAt: at, error: null });
  setRowBadgeState(assignNamedBadge(ensureHardcodedBadges(getRowBadgeState()), item.id, target.name, target.id));
}

/**
 * Writes a retry reading into the rows: only a card Getty marked "Ready to
 * submit" becomes `uploaded` (and takes the badge); everything else keeps the
 * honest failure reason. Returns how many rows turned ready.
 */
export function applyGettyRetry(
  target: StockFtpPreset,
  items: readonly ExportedItem[],
  reading: GettyRetryReading,
  at: string = new Date().toISOString(),
): number {
  const ready = new Set(reading.ready);
  const open = new Map(reading.open.map((entry) => [entry.stem, entry.reason]));
  let turned = 0;
  for (const item of items) {
    if (!ready.has(item.stem) && !open.has(item.stem)) continue;
    if (ready.has(item.stem)) {
      turned += 1;
      markUploaded(item, target, at);
      continue;
    }
    recordSiteUploadStatus(item.id, target.id, {
      status: "failed", formats: [], uploadedAt: at, error: open.get(item.stem) ?? reading.reason,
    });
  }
  return turned;
}

/** What the "Retry not-ready files" button needs from the panel. */
export interface GettyRetryCtx {
  bridgeUrl: string;
  preset: StockFtpPreset | null;
  retry: GettyWebRetryTarget | null;
  progress: UploadProgressStep | null;
  items: readonly ExportedItem[];
  loadCreds: (presetId: string) => Promise<FtpCredentials | null>;
  apply: (patch: { retry: GettyWebRetryTarget | null; progress: UploadProgressStep | null }) => void;
  say: (msg: string, err?: boolean) => void;
}

/** The finished bar, re-titled with what the retry actually changed. */
function retryProgress(
  p: UploadProgressStep | null, target: StockFtpPreset, change: { turned: number; left: number; reason: string },
): UploadProgressStep | null {
  const { turned, left, reason } = change;
  if (!p) return null;
  const label = left > 0
    ? `${target.name}: ${turned} more file(s) ready, ${left} still not ready — ${reason}`
    : `${target.name}: ${turned} more file(s) ready to submit`;
  return { ...p, label, pending: left, complete: true };
}

/**
 * "Retry not-ready files": the batch is still open, so only the names the run
 * left behind are re-filled, re-saved and re-read. Rows follow Getty's cards — a
 * retry that still shows no "Ready to submit" stays failed, never uploaded.
 */
export async function runGettyRetry(c: GettyRetryCtx): Promise<void> {
  const { preset, retry } = c;
  if (!preset || !retry || retry.names.length === 0) {
    c.say("Nothing to retry — the batch is already submitted", true);
    return;
  }
  const creds = await c.loadCreds(preset.id);
  if (!creds) { c.say(`No saved credentials for ${preset.name}`, true); return; }
  const reading = await retryOpenGettyFiles({
    bridgeUrl: c.bridgeUrl, preset, creds, sessionKey: retry.sessionKey, names: retry.names,
  });
  if (!reading.reached) { c.say(reading.reason, true); return; }
  const turned = applyGettyRetry(preset, c.items, reading);
  const left = reading.open.length;
  c.apply({
    retry: left > 0 ? { sessionKey: retry.sessionKey, names: reading.open.map((entry) => entry.stem) } : null,
    progress: retryProgress(c.progress, preset, { turned, left, reason: reading.reason }),
  });
  c.say(left > 0
    ? `${turned} file(s) turned Ready to submit, ${left} still open: ${reading.reason}`
    : `${turned} file(s) are now Ready to submit`, left > 0);
}
