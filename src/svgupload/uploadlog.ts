// uploadlog.ts — the SVG-to-upload tab's log vocabulary (design §3). The tab has
// no log of its own: the shell's docked log is the one activity log, and this
// module is the only thing that turns an upload event into the safe entry it
// keeps.
//
// Two rules are enforced by the shape of these functions rather than by a
// comment: every entry names the ICON (pair id + export base) and the OUTCOME,
// and `data` is never used — the metadata text, the prompt, the response body and
// the API key have no field to travel in.

import type { LogSpec } from "../lib/log";

export const UPLOAD_FEATURE = "upload";

/** The identifying half of an entry: which icon this was about. */
export interface IconRef {
  id: string;
  base: string;
}

/** A naming run produced an answer the policy accepted. */
export function acceptSpec(ref: IconRef & { model: string; tags: number }): LogSpec {
  return {
    level: "info",
    feature: UPLOAD_FEATURE,
    action: "named",
    ids: { pair: ref.id, base: ref.base },
    detail: `${ref.tags} tags accepted from ${ref.model}; the answer is embedded on the next export`,
  };
}

/** A naming run came back with something the policy refused (or nothing at all). */
export function rejectSpec(ref: IconRef & { why: string }): LogSpec {
  return {
    level: "warn",
    feature: UPLOAD_FEATURE,
    action: "name-refused",
    ids: { pair: ref.id, base: ref.base },
    detail: ref.why,
  };
}

/** One export finished: the three levels match the three outcomes. */
export function exportSpec(ref: IconRef & { status: string; note: string }): LogSpec {
  return {
    level: levelOfStatus(ref.status),
    feature: UPLOAD_FEATURE,
    action: "exported",
    ids: { pair: ref.id, base: ref.base },
    detail: `${ref.status} — ${ref.note}`,
  };
}

/** A cancel: how many unsent jobs it stopped (finished packages were kept). */
export function cancelSpec(stopped: number): LogSpec {
  return {
    level: "warn",
    feature: UPLOAD_FEATURE,
    action: "cancelled",
    ids: { stopped },
    detail: countLabel(stopped, "unsent export was", "unsent exports were") + " stopped; completed packages were kept",
  };
}

/** The restart note: unfinished work came back as interrupted, never re-sent. */
export function restoreSpec(count: number): LogSpec {
  return {
    level: "warn",
    feature: UPLOAD_FEATURE,
    action: "restored",
    ids: { interrupted: count },
    detail: `${count} export${count === 1 ? "" : "s"} did not finish before the app closed; nothing was sent again`,
  };
}

/** The provider check: the verdict, with the model id but never the key. */
export function providerSpec(input: { model: string; ok: boolean; reason: string }): LogSpec {
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

/** The three outcomes, mapped once so the log and the row cannot disagree. */
function levelOfStatus(status: string): LogSpec["level"] {
  if (status === "processed") return "info";
  if (status === "partial" || status === "cancelled") return "warn";
  return "error";
}
