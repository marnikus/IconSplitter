// historystore.ts — persistence for the global timeline (request §8, RULE 13).
// One localStorage key holding one complete document; a blocked storage costs
// the timeline, never the app. Validation lives in `src/lib/history.ts`.

export const HISTORY_KEY = "iconSplitter.history.v1";

export function loadHistoryText(): string | null {
  try {
    return localStorage.getItem(HISTORY_KEY);
  } catch {
    return null; // storage unavailable: start with an empty timeline
  }
}

export function saveHistoryText(text: string): void {
  try {
    localStorage.setItem(HISTORY_KEY, text);
  } catch {
    // private mode / quota: the in-memory timeline keeps working this session
  }
}

export function clearHistoryText(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // nothing to do — the next save overwrites it anyway
  }
}
