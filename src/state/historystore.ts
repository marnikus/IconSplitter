// historystore.ts — localStorage IO for the global undo timeline.
// Parsing and validation live in lib/history, so a corrupt or foreign payload
// costs one ignored load, never a broken startup (RULE 13).

import { parseTimeline, serializeTimeline, type Timeline } from "../lib/history";
import { readKey, writeKey } from "./safestorage";

export const HISTORY_KEY = "iconSplitter.history.v1";

export function loadHistory(): Timeline {
  return parseTimeline(readKey(HISTORY_KEY));
}

export function saveHistory(timeline: Timeline): void {
  writeKey(HISTORY_KEY, serializeTimeline(timeline));
}
