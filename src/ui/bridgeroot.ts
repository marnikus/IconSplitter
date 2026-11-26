// bridgeroot.ts — a picked folder's full path through the local helper
// (2026-11-16, tools/bridge/findfolder.mjs): the browser never says where a
// picked folder is, so the helper finds the folder with this name that holds
// these entries, and the answer is bound to the handle and saved like a capture.
// No helper, or not found: nothing is bound (the old Explorer copy still works).
import type { DirHandleLike } from "../lib/fs";
import { boundRootPathInfo, knownRoots, rememberKnownRoot, setRootResolver } from "../lib/knownroots";
import { persistRootPath } from "../lib/rootstore";
import { loadBridgeConfig } from "../upload/configstore";

const MARKERS = 12;

async function markersOf(handle: DirHandleLike): Promise<string[]> {
  const names: string[] = [];
  try { for await (const [name] of handle.entries()) { names.push(name); if (names.length >= MARKERS) break; } } catch { /* unreadable: none */ }
  return names;
}

/**
 * One search at a time (2026-11-26): every tab asks for its folder at page load,
 * and each search can hold the helper for seconds. A search that found nothing
 * is not repeated for the same folder listing until the page is loaded again.
 */
let queue: Promise<unknown> = Promise.resolve();
const missed = new Set<string>();

/** Asks the helper; binds and saves the path it finds. Answers the path, or null. */
export function findRootViaBridge(handle: DirHandleLike): Promise<string | null> {
  const run = queue.then(() => findNow(handle), () => findNow(handle));
  queue = run.catch(() => undefined);
  return run;
}

async function findNow(handle: DirHandleLike): Promise<string | null> {
  if (boundRootPathInfo(handle).path !== "") return boundRootPathInfo(handle).path; // also: another tab's search just found it
  const markers = await markersOf(handle);
  if (markers.length === 0) return null;
  const key = [handle.name, ...markers].join("|");
  if (missed.has(key)) return null;
  return askBridge(handle, markers, key); // a helper that is not running is asked again next time
}

async function askBridge(handle: DirHandleLike, markers: string[], key: string): Promise<string | null> {
  const hints = knownRoots().map((k) => k.path).filter((p) => p !== "");
  try {
    const res = await fetch(`${loadBridgeConfig().url}/find-folder`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: handle.name, markers, hints }),
      signal: AbortSignal.timeout(20000), // a stuck helper never holds the next search
    });
    const out = (await res.json()) as { ok?: boolean; path?: unknown };
    if (out.ok !== true || typeof out.path !== "string") { missed.add(key); return null; } // the helper looked and found nothing
    rememberKnownRoot(handle, out.path, "derived");
    if (boundRootPathInfo(handle).path === "") return null; // refused as not a folder path
    await persistRootPath(handle, { path: boundRootPathInfo(handle).path, how: "derived" });
    return out.path;
  } catch { return null; }
}

// Not under the test runner: a test never reaches a real helper on this machine (tests opt in by calling setRootResolver).
const testing = typeof process !== "undefined" && (process as { env?: Record<string, string | undefined> }).env?.VITEST !== undefined;
if (!testing) setRootResolver(findRootViaBridge);
