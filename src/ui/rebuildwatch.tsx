// rebuildwatch.tsx — the page reloads itself when the helper rebuilds the bundle
// under it, and says so in one short line at the top of the page.
//
// The helper rebuilds `dist/` after a pull (and on a restart). A tab that was
// opened before that keeps running the old bundle until someone presses F5. This
// hook polls `/health`, compares the stamp the build wrote into the page with the
// stamp the helper reports for the file it serves, and reloads — never while an
// upload or a run is in flight, and always with a one-line confirmation.
//
// 2026-11-01: whitespace-only touch, on purpose — it moves the bundle stamp too, so
// the reload that the touch above triggers is exercised against a genuinely new build.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_BRIDGE_URL } from "../lib/upload/epsconv/bridgeconfig";
import { runningCount, markRunning } from "../lib/runbusy";
import {
  NOTICE_KEY, RELOAD_MARK_KEY, rememberNotice, reloadAllowed, servedBuildOf, servedNote, servedStampOf,
  stalledNote, takeNotice, reloadDecision, type BuildInfo,
} from "../lib/updatewatch";

const POLL_MS = 15_000;
const NO_BUILD: BuildInfo = { commit: null, builtAt: null };

function reloadPage(): void {
  globalThis.location.reload();
}
/** Long enough to read the line before the page swaps, short enough not to drag. */
const RELOAD_DELAY_MS = 900;
const KEEP_MS = 8_000;

export interface RebuildNotice {
  title: string;
  detail: string;
  action: string | null;
}

export interface WatchOpts {
  pollMs?: number;
  reload?: () => void;
  fetchImpl?: (url: string) => Promise<Response>;
}

export interface WatchHandle {
  notice: RebuildNotice | null;
  dismiss: () => void;
  reloadNow: () => void;
}

/** Keeps `runbusy` in step with a panel flag; the reload gate reads it. */
export function useRunning(key: string, active: boolean): void {
  useEffect(() => {
    markRunning(key, active);
    return () => markRunning(key, false);
  }, [key, active]);
}

function ownStamp(): string | null {
  const el = document.querySelector('meta[name="iconsplitter-src-hash"]');
  return el === null ? null : el.getAttribute("content");
}

function healthUrl(): string {
  const { protocol, origin } = globalThis.location;
  return protocol === "http:" || protocol === "https:" ? `${origin}/health` : `${DEFAULT_BRIDGE_URL}/health`;
}

const defaultFetch = (url: string): Promise<Response> => globalThis.fetch(url);

async function readHealth(fetchImpl: (url: string) => Promise<Response>): Promise<unknown | null> {
  try {
    const res = await fetchImpl(healthUrl());
    return res.ok ? await res.json() : null;
  } catch {
    return null; // the helper is down or restarted — the next tick asks again
  }
}

/** The confirmation left by the page that just reloaded, shown once and dropped. */
function useKeptNotice(): RebuildNotice | null {
  const [kept, setKept] = useState<RebuildNotice | null>(null);
  useEffect(() => {
    const raw = readSession(NOTICE_KEY);
    writeSession(NOTICE_KEY, null);
    if (raw === null) return undefined;
    setKept(takeNotice(raw));
    const timer = setTimeout(() => setKept(null), KEEP_MS);
    return () => clearTimeout(timer);
  }, []);
  return kept;
}

/** Reads a session value without letting a blocked store break the page. */
function readSession(key: string): string | null {
  try {
    return globalThis.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.sessionStorage.removeItem(key);
    else globalThis.sessionStorage.setItem(key, value);
  } catch {
    // no storage: the reload still happens, only the confirmation is lost
  }
}

function keepForNextPage(build: BuildInfo): void {
  try {
    globalThis.sessionStorage.setItem(NOTICE_KEY, rememberNotice(build));
  } catch {
    // no storage: the reload still happens, only the confirmation is lost
  }
}

interface WatchEnv {
  own: string;
  dismissed: { current: boolean };
  reloading: { current: BuildInfo | null };
  setLive: (n: RebuildNotice | null) => void;
  reloadNow: () => void;
}

/** What to do about the health report the helper just gave. */
function applyHealth(env: WatchEnv, health: unknown): "stop" | "ask-again" {
  const served = servedStampOf(health);
  const build = servedBuildOf(health);
  const active = runningCount();
  const decision = reloadDecision({ own: env.own, served, activeRuns: active, dismissed: env.dismissed.current });
  if (decision === "reload" && served !== null) return startReload(env, served, build);
  env.reloading.current = decision === "wait" ? build : null;
  env.setLive(decision === "wait"
    ? { title: "New build ready", detail: servedNote({ reloading: false, activeRuns: active }), action: "Reload now" }
    : null);
  return "ask-again";
}

/** One automatic reload per (own → served) pair, so a page that cannot pick the
 *  new bundle up says "press reload" instead of looping. */
function startReload(env: WatchEnv, served: string, build: BuildInfo): "stop" {
  const mark = reloadAllowed(readSession(RELOAD_MARK_KEY), env.own, served);
  if (!mark.allowed) {
    env.setLive(stalledNote());
    return "stop"; // only the reader can move this page now
  }
  writeSession(RELOAD_MARK_KEY, mark.next);
  env.reloading.current = build;
  env.setLive({ title: "New build found", detail: servedNote({ reloading: true, activeRuns: 0 }), action: null });
  setTimeout(env.reloadNow, RELOAD_DELAY_MS);
  return "stop"; // this page is leaving
}

function useBundlePoll(env: WatchEnv | null, fetchImpl: (url: string) => Promise<Response>, pollMs: number): void {
  useEffect(() => {
    if (env === null) return undefined; // dev server / unstamped page: nothing to compare
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      const health = await readHealth(fetchImpl);
      if (stopped) return;
      if (health !== null && applyHealth(env, health) === "stop") return;
      timer = setTimeout(tick, pollMs);
    };
    timer = setTimeout(tick, pollMs);
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [env, fetchImpl, pollMs]);
}

export function useRebuildWatch(opts: WatchOpts = {}): WatchHandle {
  const [live, setLive] = useState<RebuildNotice | null>(null);
  const kept = useKeptNotice();
  const [own] = useState(ownStamp);
  const dismissed = useRef(false);
  const reloading = useRef<BuildInfo | null>(null);
  const asked = opts.reload;

  const reloadNow = useCallback(() => {
    keepForNextPage(reloading.current ?? NO_BUILD);
    (asked ?? reloadPage)();
  }, [asked]);

  const dismiss = useCallback(() => {
    dismissed.current = true;
    setLive(null);
  }, []);

  const env = useMemo<WatchEnv | null>(
    () => (own === null ? null : { own, dismissed, reloading, setLive, reloadNow }),
    [own, reloadNow],
  );
  useBundlePoll(env, opts.fetchImpl ?? defaultFetch, opts.pollMs ?? POLL_MS);

  return { notice: live ?? kept, dismiss, reloadNow };
}

export interface RebuildToastProps {
  notice: RebuildNotice | null;
  onDismiss: () => void;
  onAction: () => void;
}

/** One short line at the top of the page — status, not an error. */
export default function RebuildToast({ notice, onDismiss, onAction }: RebuildToastProps) {
  if (notice === null) return null;
  return (
    <div
      className="rebuild-toast fixed left-1/2 top-2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-lg border border-indigo-400/40 bg-indigo-600/95 px-3 py-1.5 text-xs text-white shadow-lg"
      role="status" aria-live="polite" data-testid="rebuild-toast"
    >
      <span className="font-semibold" data-testid="rebuild-toast-title">{notice.title}</span>
      <span className="text-indigo-100" data-testid="rebuild-toast-detail">{notice.detail}</span>
      {notice.action !== null && (
        <button type="button" className="rounded bg-white/20 px-2 py-0.5 font-medium hover:bg-white/30"
          data-testid="rebuild-toast-action" onClick={onAction}>{notice.action}</button>
      )}
      <button type="button" className="rounded px-1 text-indigo-100 hover:text-white"
        aria-label="Dismiss" data-testid="rebuild-toast-dismiss" onClick={onDismiss}>✕</button>
    </div>
  );
}
