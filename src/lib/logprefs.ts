// logprefs.ts — the dock's two preferences: how many entries are kept and
// shown (ONE control, RULE 10), and whether the dock is minimised. Validated on
// read like every stored value (RULE 13): max only ever comes from the fixed
// choices, so a hand-edited or half-typed value can never delete entries.

import { isRecord } from "./isrecord";

export const MAX_CHOICES = [100, 250, 500, 1000, 2000, 5000] as const;

export interface LogPrefs {
  max: number;
  minimized: boolean;
}

export const DEFAULT_LOG_PREFS: LogPrefs = { max: 1000, minimized: false };

export function parseLogPrefs(text: string | null): LogPrefs {
  if (text === null) return { ...DEFAULT_LOG_PREFS };
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || raw.v !== 1) return { ...DEFAULT_LOG_PREFS };
    const max = (MAX_CHOICES as readonly unknown[]).includes(raw.max) ? (raw.max as number) : DEFAULT_LOG_PREFS.max;
    return { max, minimized: raw.minimized === true };
  } catch {
    return { ...DEFAULT_LOG_PREFS }; // unreadable preferences are the defaults, not an error
  }
}

export function serializeLogPrefs(prefs: LogPrefs): string {
  return JSON.stringify({ v: 1, max: prefs.max, minimized: prefs.minimized });
}
