// uploadlog.ts — the "SVG to upload" tab's log vocabulary (CP-1 / report §9).
// The tab has no log of its own: the shell's docked log is the one activity log,
// and this module is the ONLY writer for the tab's entries.
//
// Two rules are enforced by the shape of these functions, not by a comment:
// every entry names the ICON and the OUTCOME, and the returned spec has NO
// `data` field — the metadata text, the prompt, the response body and the API
// key have nowhere to travel. Anything else the tab does (root picked, defaults
// changed, a key stored) is reported through the toast and the undo bar, not
// through the log (RULE 2 is the toast's job; the log is the outcome trail).

import type { LogSpec } from "../lib/log";

export const UPLOAD_FEATURE = "upload";

/** The CLOSED set of actions the tab may emit, in one place for the lock test. */
export const UPLOAD_LOG_ACTIONS = [
  "named", "name-refused", "exported", "cancelled", "restored", "model-checked", "downloaded",
] as const;

export type UploadLogAction = (typeof UPLOAD_LOG_ACTIONS)[number];

/** A spec with no data field: the entry's scalars are counts, spelled in text. */
export type UploadLogSpec = Omit<LogSpec, "data" | "feature" | "action"> & {
  feature: typeof UPLOAD_FEATURE;
  action: UploadLogAction;
};

/** The identifying half of an entry: which icon this was about. */
export interface IconRef {
  id: string;
  base: string;
}

/** A naming run produced an answer the policy accepted. */
export function namedSpec(ref: IconRef & { model: string; tags: number }): UploadLogSpec {
  return {
    level: "info",
    feature: UPLOAD_FEATURE,
    action: "named",
    ids: { pair: ref.id, base: ref.base },
    detail: `${ref.tags} tags accepted from ${ref.model}; the answer is embedded on the next export`,
  };
}

/** A naming run came back with something the policy refused (or nothing at all). */
export function nameRefusedSpec(ref: IconRef & { why: string }): UploadLogSpec {
  return {
    level: "warn",
    feature: UPLOAD_FEATURE,
    action: "name-refused",
    ids: { pair: ref.id, base: ref.base },
    detail: ref.why,
  };
}

/** One export finished: the level follows the outcome, never a caller's guess. */
export function exportedSpec(ref: IconRef & { status: string; note: string }): UploadLogSpec {
  return {
    level: levelOfStatus(ref.status),
    feature: UPLOAD_FEATURE,
    action: "exported",
    ids: { pair: ref.id, base: ref.base },
    detail: `${ref.status} — ${ref.note}`,
  };
}

/** What one export run has to say: the failure first, else its automatic fixes, else the plain outcome. */
export function exportOutcomeNote(r: { status: string; error: string; notes: string[] }): string {
  if (r.error !== "") return r.error;
  if (r.notes.length > 0) return `EPS auto-fixed: ${r.notes.join("; ")}`;
  if (r.status === "processed") return "export.json was written last; the approved source is untouched";
  if (r.status === "partial") return "the required outputs committed; the optional EPS stage failed";
  if (r.status === "cancelled") return "stopped before commit; the previous package is intact";
  return "nothing was committed";
}

/** The batch toast: the count, then how many EPS files were auto-fixed (only when any were). */
export function exportBatchLine(b: { done: number; total: number; aborted: boolean; fixed: number; epsNote?: string | null }): string {
  const head = b.aborted
    ? `Export stopped after ${b.done} of ${b.total} — finished packages are kept`
    : `Exported ${b.done} icon${b.done === 1 ? "" : "s"} — each pair's export folder holds the package`;
  const fixed = b.fixed === 0 ? head : `${head} · ${b.fixed} EPS auto-fixed`;
  return b.epsNote ? `${fixed} · ${b.epsNote}` : fixed; // the pre-batch probe's verdict stays on the final line too
}

/** A cancel: how many unsent jobs it stopped (finished packages were kept). */
export function cancelledSpec(stopped: number): UploadLogSpec {
  return {
    level: "warn",
    feature: UPLOAD_FEATURE,
    action: "cancelled",
    ids: { stopped },
    detail: `${countLabel(stopped, "unsent export was", "unsent exports were")} stopped; completed packages were kept`,
  };
}

/** The restart note: unfinished work came back as interrupted, never re-sent. */
export function restoredSpec(count: number): UploadLogSpec {
  return {
    level: "warn",
    feature: UPLOAD_FEATURE,
    action: "restored",
    ids: { interrupted: count },
    detail: `${count} export${count === 1 ? "" : "s"} did not finish before the app closed; nothing was sent again`,
  };
}

/** The provider check: the verdict, with the model id but never the key. */
export function modelCheckedSpec(input: { model: string; ok: boolean; reason: string }): UploadLogSpec {
  return {
    level: input.ok ? "info" : "warn",
    feature: UPLOAD_FEATURE,
    action: "model-checked",
    ids: { model: input.model === "" ? "(unset)" : input.model },
    detail: input.ok ? "the model id is on the provider's own list" : input.reason,
  };
}

/** "2 unsent exports were" — one helper, so the count and its grammar agree. */
function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The outcomes mapped once, so the log level and the row cannot disagree. */
function levelOfStatus(status: string): UploadLogSpec["level"] {
  if (status === "processed") return "info";
  if (status === "partial" || status === "cancelled") return "warn";
  return "error";
}

/** "Download all" (2026-10-08): the selection's packages copied to one folder — the result line, counts only. */
export function downloadedSpec(ref: { line: string; failed: number }): UploadLogSpec {
  return {
    level: ref.failed > 0 ? "warn" : "info",
    feature: UPLOAD_FEATURE,
    action: "downloaded",
    detail: ref.line,
  };
}
