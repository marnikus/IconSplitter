// logstorage.ts — the log's two storage keys (log-contract.md §7): the entries
// and the preferences. Owns: load (parse-validated, so a damaged payload costs
// one ignored load), and the saver — write 500 ms after the last append (but
// never later than 5 s after the first of a busy burst), at once for an error,
// and again with HALF the byte budget after a refused write. It reports each
// outcome through a callback; it never decides what the user is told (that is
// the store's job), and it never touches the key or the provider (RULE 20).

import type { LogEntry, ParsedLog } from "../lib/logentry";
import { parseLog, serializeLog } from "../lib/logentry";
import { parseLogPrefs, serializeLogPrefs, type LogPrefs } from "../lib/logprefs";
import { readKey, writeKey } from "../state/safestorage";

export const LOG_KEY = "iconSplitter.log.v1";
export const PREFS_KEY = "iconSplitter.log.prefs.v1";
/** The persisted tail: what fits, newest first-class — in characters of the serialised payload. */
export const BYTE_BUDGET = 256 * 1024;
const MIN_BUDGET = 8 * 1024;
const DEBOUNCE_MS = 500;
const MAX_WAIT_MS = 5000;

export const loadLog = (): ParsedLog => parseLog(readKey(LOG_KEY));
export const loadPrefs = (): LogPrefs => parseLogPrefs(readKey(PREFS_KEY));
export const savePrefs = (prefs: LogPrefs): boolean => writeKey(PREFS_KEY, serializeLogPrefs(prefs));

export interface Saver {
  /** Ask for a write: soon, or at once when `urgent`. */
  schedule: (urgent: boolean) => void;
  /** Write now (pagehide, clear, tests). */
  flush: () => void;
  /** Forget a pending write and the budget lost to earlier failures. */
  reset: () => void;
}

export function createSaver(read: () => readonly LogEntry[], done: (ok: boolean) => void): Saver {
  let timer = 0;
  let since = 0;
  let budget = BYTE_BUDGET;
  const stop = () => {
    window.clearTimeout(timer);
    timer = 0;
    since = 0;
  };
  const flush = () => {
    stop();
    const ok = writeKey(LOG_KEY, serializeLog(read(), budget, new Date().toISOString()));
    if (!ok) budget = Math.max(MIN_BUDGET, Math.floor(budget / 2));
    done(ok);
  };
  const schedule = (urgent: boolean) => {
    if (urgent) return flush();
    const now = Date.now();
    if (since === 0) since = now;
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - (now - since))));
  };
  return { schedule, flush, reset: () => { stop(); budget = BYTE_BUDGET; } };
}
