// logger.ts — the only import a feature needs to be observable (log-contract.md §8).
// `log` never throws and never blocks a feature (RULE 9, L-2): if recording
// fails the failure is counted and the dock shows the count — never silent
// (RULE 2). Features pass facts, never the key: the redactor is the second line
// of defence, not the first.

import type { LogFeature, LogInput, LogLevel } from "../lib/logentry";
import { noteDropped, record } from "./logstore";
import { newId as makeId } from "./session";

export function log(input: LogInput): void {
  try {
    record(input);
  } catch {
    noteDropped(); // counted and shown by the dock — a failing log must never fail the feature
  }
}

export type Extra = Pick<LogInput, "ids" | "data" | "usage" | "fold">;

export interface Logger {
  info: (action: string, message: string, extra?: Extra) => void;
  warn: (action: string, message: string, extra?: Extra) => void;
  error: (action: string, message: string, extra?: Extra) => void;
}

/** A logger bound to one feature: `logger("svg").warn("request.retry", "…", { ids })`. */
export function logger(feature: LogFeature): Logger {
  const at = (level: LogLevel) => (action: string, message: string, extra: Extra = {}) =>
    log({ level, feature, action, message, ...extra });
  return { info: at("info"), warn: at("warn"), error: at("error") };
}

/** Mirrors a toast 1:1 (L-4): the level comes from `err`, the text is the toast's own. */
export function logStatus(feature: LogFeature, message: string, err = false): void {
  log({ level: err ? "error" : "info", feature, action: "status", message });
}

/** A run/batch id to carry in `ids`. */
export const newId = (prefix: string): string => makeId(prefix);
