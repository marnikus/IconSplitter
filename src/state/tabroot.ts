// tabroot.ts — the ONE way a tab keeps, restores and re-opens its folder
// (2026-11-28). Every tab had its own boot, and only Generate SVG knew what a
// reload really does: the browser hands a remembered folder back WITHOUT read
// access until the user clicks. The SVG builder, SVG to upload, Upload and
// Selection scanned anyway, failed, and showed an empty tab with no folder.
// Now all of them go through here:
//
//   * `bootTabRoot`     — at start: the tab's own folder (else a borrowed one),
//                         shown AT ONCE, scanned only when the browser allows.
//   * `rescanTabRoot`   — on a click (Rescan / 🔓 Restore access): the one
//                         moment the browser may be asked for access
//                         (`openTabRoot`), then the scan.
//   * `rememberTabRoot` — after a pick.
//   * `storedRoot`      — a remembered folder by key, for undo paths.
//
// No step here can hold a tab or throw: the handle store, the path lookup and
// the browser's access answer are each waited for a bounded time only.

import { peekPermission } from "../batch/picker";
import { loadHandles, saveHandles } from "../batch/store";
import { orNull } from "../lib/bounded";
import type { DirHandleLike } from "../lib/fs";
import { ANSWER_MS, restoreKnownRoot, withinMs } from "../lib/knownroots";

export type RootTab = "selection" | "svg" | "upload" | "builder" | "stock";

/** Where each tab's folder handle is kept (IndexedDB keys — never change one: users' saved folders live there). */
export const ROOT_KEYS: Record<RootTab, string> = {
  selection: "__selection__", svg: "__svg__", upload: "__upload__", builder: "__svgBuilder__", stock: "__stock_upload__",
};

export const TAB_ROOTS = Object.keys(ROOT_KEYS) as RootTab[];

/** A tab with no folder of its own starts on another tab's, in this order. */
const BORROWS: Record<RootTab, readonly RootTab[]> = {
  selection: [], svg: ["selection"], upload: ["svg", "selection"],
  builder: ["upload", "svg", "selection"], stock: ["upload", "svg", "selection"],
};

/** Tabs that keep a borrowed folder as their own: the builder's removals find their pair files through its key. */
const ADOPTS: readonly RootTab[] = ["builder"];

/** How long the handle store is waited for. */
const STORE_MS = 3000;

export const LOCKED_NOTE = "Click 🔓 Restore access — the browser re-opens a remembered folder only after a click";

export interface TabRoot {
  handle: DirHandleLike;
  /** "locked": the browser wants a click before the folder can be read. */
  access: "open" | "locked";
}

export interface BootHooks {
  /** The folder is known: put it on screen (before anything slow). */
  show: (handle: DirHandleLike) => void;
  /** The folder is readable: scan it. */
  scan: (handle: DirHandleLike) => void | Promise<void>;
  say?: (message: string, error?: boolean) => void;
}

/** The folder kept under `key`, or null — also when the store fails or does not answer. */
export async function storedRoot(key: string): Promise<DirHandleLike | null> {
  return (await orNull(loadHandles(key), STORE_MS))?.source ?? null;
}

/** Keeps `handle` under `key`. False when it could not be saved — never an error. */
export async function keepRoot(key: string, handle: DirHandleLike): Promise<boolean> {
  try {
    await saveHandles(key, { source: handle });
    return true;
  } catch {
    return false;
  }
}

/** Keeps `handle` as the tab's folder. False when it could not be saved (the session still has it). */
export function rememberTabRoot(tab: RootTab, handle: DirHandleLike): Promise<boolean> {
  return keepRoot(ROOT_KEYS[tab], handle);
}

/** The tab's own folder, else the first borrowed one. */
async function findRoot(tab: RootTab): Promise<DirHandleLike | null> {
  const own = await storedRoot(ROOT_KEYS[tab]);
  if (own !== null) return own;
  for (const other of BORROWS[tab]) {
    const handle = await storedRoot(ROOT_KEYS[other]);
    if (handle === null) continue;
    if (ADOPTS.includes(tab)) await rememberTabRoot(tab, handle);
    return handle;
  }
  return null;
}

/** Whether the folder can be read now, without asking the browser anything. No answer in time counts as open: the scan finds out. */
export async function rootAccess(handle: DirHandleLike): Promise<TabRoot["access"]> {
  const answer = await withinMs(peekPermission(handle), ANSWER_MS);
  return answer === undefined || answer === "granted" ? "open" : "locked";
}

/**
 * A tab's start: its remembered folder is shown, its saved full path bound, and
 * — only when the browser allows reading — scanned. Null when there is none.
 */
export async function bootTabRoot(tab: RootTab, on: BootHooks): Promise<TabRoot | null> {
  const handle = await findRoot(tab);
  if (handle === null) return null;
  on.show(handle);
  await restoreKnownRoot(handle).catch(() => undefined); // a failed lookup only leaves the path unknown
  const access = await rootAccess(handle);
  if (access === "locked") on.say?.(LOCKED_NOTE);
  else await Promise.resolve().then(() => on.scan(handle)).catch(() => undefined); // the scan reports its own failure
  return { handle, access };
}

/** The whole Rescan click every tab shares: open the folder (asking the browser when it must), then scan. */
export async function rescanTabRoot(handle: DirHandleLike | null, say: (message: string, error?: boolean) => void, scan: () => void | Promise<void>): Promise<void> {
  if (await openTabRoot(handle, say)) await scan();
}

/**
 * Revision + subscribers: a folder opened by a click is open for every tab that
 * holds it, so each Rescan button re-checks its lock when any of them was asked.
 */
let revision = 0;
const listeners = new Set<() => void>();
export function subscribeRootAccess(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export const rootAccessRevision = (): number => revision;
function accessChanged(): void {
  revision += 1;
  for (const fn of listeners) fn();
}

type Asking = { requestPermission?: (d: { mode: string }) => Promise<string> };

/**
 * The click that (re)opens a folder: asks the browser when it must. False when
 * there is no folder or access was refused — and that is said.
 */
export async function openTabRoot(handle: DirHandleLike | null, say: (message: string, error?: boolean) => void): Promise<boolean> {
  if (handle === null) return false;
  const ask = (handle as Asking).requestPermission;
  // the quiet check is bounded; a browser that does not answer it is simply asked
  if (typeof ask !== "function" || (await withinMs(peekPermission(handle), ANSWER_MS)) === "granted") return true;
  const answer = await ask.call(handle, { mode: "readwrite" }).catch(() => "denied");
  accessChanged();
  if (answer === "granted") return true;
  say(`Access to "${handle.name}" was refused — the browser must allow it before the folder can be read`, true);
  return false;
}
