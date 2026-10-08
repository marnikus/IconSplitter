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

/**
 * One icon's copy into the chosen folder ("Download all", D6). `problem` is ""
 * when every file the icon had was written; otherwise it names what was not.
 */
export function downloadedSpec(ref: IconRef & { written: number; folder: string; problem: string }): UploadLogSpec {
  const what = ref.written === 0 ? "nothing copied" : `${countLabel(ref.written, "file", "files")} copied`;
  return {
    level: ref.problem === "" ? "info" : "warn",
    feature: UPLOAD_FEATURE,
    action: "downloaded",
    ids: { pair: ref.id, base: ref.base },
    detail: `${what} to “${ref.folder}”${ref.problem === "" ? "" : ` — ${ref.problem}`}`,
  };
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
