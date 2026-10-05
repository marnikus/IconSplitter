// logscroll.ts — the follow-scroll machine of the log dock (log-panel.md §4):
// follow the newest entry while the user is at the bottom, stop the moment they
// scroll up, resume when they return. Pure numbers in, numbers out; the DOM glue
// (useStickyScroll) only reads geometry and calls these. No checkbox: the scroll
// position IS the decision (RULE 10).

import type { LogEntry, LogLevel } from "./logentry";

/** How close to the end still counts as "at the bottom", in px. */
export const BOTTOM_EPS = 4;

/** scrollTop, scrollHeight, clientHeight. */
export interface Geometry {
  top: number;
  height: number;
  client: number;
}

export interface Follow {
  following: boolean;
  /** Entries appended while the user was not looking at the end. */
  unseen: number;
  unseenErrors: number;
}

export const FOLLOWING: Follow = Object.freeze({ following: true, unseen: 0, unseenErrors: 0 });

export interface Move {
  follow: Follow;
  /** True when the view must be scrolled to the bottom after layout. */
  pin: boolean;
}

export const atBottom = (g: Geometry): boolean => g.height - g.top - g.client <= BOTTOM_EPS;

/** A scroll event: at the bottom resumes following; anywhere else pauses it. */
export function onUserScroll(f: Follow, g: Geometry): Follow {
  return atBottom(g) ? FOLLOWING : { ...f, following: false };
}

/** Wheel up, PageUp, ArrowUp, Home: pause BEFORE the scroll event, so a burst of appends cannot yank the view back. */
export const onIntentUp = (f: Follow): Follow => ({ ...f, following: false });

/** Entries were appended. Visible + following pins; otherwise they are counted. */
export function onAppend(f: Follow, levels: readonly LogLevel[], visible: boolean): Move {
  if (f.following && visible) return { follow: f, pin: true };
  const errors = levels.filter((l) => l === "error").length;
  return { follow: { ...f, unseen: f.unseen + levels.length, unseenErrors: f.unseenErrors + errors }, pin: false };
}

/** The dock was restored: following pins and forgets the count; paused keeps its place. */
export function onRestore(f: Follow): Move {
  return f.following ? { follow: FOLLOWING, pin: true } : { follow: f, pin: false };
}

/** "Jump to latest" / End: a shortcut to the bottom, not a second setting. */
export const onJump = (): Move => ({ follow: FOLLOWING, pin: true });

export interface Appended {
  added: readonly LogEntry[];
  /** True when the entry the view last saw is gone: the log was cleared, so the view starts over. */
  replaced: boolean;
}

/** What is new since `lastId`, the newest entry the view has accounted for. */
export function appendedSince(entries: readonly LogEntry[], lastId: string | null): Appended {
  if (lastId === null) return { added: entries, replaced: false };
  const at = entries.findIndex((e) => e.id === lastId);
  return at === -1 ? { added: entries, replaced: true } : { added: entries.slice(at + 1), replaced: false };
}
