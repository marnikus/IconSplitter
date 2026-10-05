// session.ts — who and when: the session id (one per page load), the clock, and
// the counters behind entry ids and run ids. Kept apart from the store so the
// store can stamp its own breadcrumbs without importing the logger, and apart
// from the logger so nothing else needs to know how an id is made.

const randomSid = (): string => Math.random().toString(36).slice(2, 8).padEnd(6, "0");

let sid = randomSid();
let entryCount = 0;
let idCount = 0;

export const isoNow = (): string => new Date().toISOString();

export interface Stamp {
  id: string;
  at: string;
  sid: string;
}

/** The identity of the next entry: `${sid}-${n}`, monotonic, never reused in a session. */
export function nextStamp(): Stamp {
  entryCount += 1;
  return { id: `${sid}-${entryCount}`, at: isoNow(), sid };
}

/** A run/batch id a feature can carry in `ids`: "r" + part of the session + a counter. */
export function newId(prefix: string): string {
  idCount += 1;
  return `${prefix}${sid.slice(0, 4)}-${idCount}`;
}

/** A new page load, as far as the log can tell. Tests call it; the app never needs to. */
export function resetSession(): void {
  sid = randomSid();
  entryCount = 0;
  idCount = 0;
}
