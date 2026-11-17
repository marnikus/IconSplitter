// updatewatch.ts — does the page this tab runs still match what the helper serves?
//
// The build writes a `src/` fingerprint into `dist/index.html` as
// `<meta name="iconsplitter-src-hash">`. The helper reports the stamp of the file
// it is serving on `/health`. When the two differ, the tab is running a bundle
// that was replaced under it — the helper restarted and rebuilt — so the page
// reloads itself and says so in one short line. Pure: no DOM, no React, no clock
// reads outside the small `clockOf` formatter.

/** What the helper says about the bundle it serves right now. */
export interface BuildInfo {
  commit: string | null;
  builtAt: string | null;
}

export interface UpdateNote {
  title: string;
  detail: string;
  /** Set only when the reader can hurry a held reload along. */
  action: string | null;
}

export type ReloadDecision = "none" | "reload" | "wait";

export interface ReloadInput {
  /** Stamp of the page this tab is running (`null` in dev / an unstamped page). */
  own: string | null;
  /** Stamp the helper is serving (`null` when it does not report one). */
  served: string | null;
  /** Uploads, batch runs and generations in flight — a reload would kill them. */
  activeRuns: number;
  /** The reader waved the notice away: no reload until the tab is reopened. */
  dismissed: boolean;
}

const STAMP = /name="iconsplitter-src-hash"\s+content="([^"]+)"/;
const KEPT_KEY = "iconsplitter-rebuild-notice";

/** The stamp a built page carries, or `null` for a page that was never stamped. */
export function metaStampOf(html: string): string | null {
  const m = STAMP.exec(html ?? "");
  return m === null ? null : m[1];
}

/** `health.update.served.stamp` if the helper reports one; older helpers do not. */
export function servedStampOf(health: unknown): string | null {
  const served = (health as { update?: { served?: { stamp?: unknown } } } | null)?.update?.served;
  return typeof served?.stamp === "string" && served.stamp !== "" ? served.stamp : null;
}

/** What the helper says it is serving, for the confirmation line. */
export function servedBuildOf(health: unknown): BuildInfo {
  const update = (health as { update?: { commit?: unknown; served?: { builtAt?: unknown } } } | null)?.update;
  return {
    commit: typeof update?.commit === "string" ? update.commit : null,
    builtAt: typeof update?.served?.builtAt === "string" ? update.served.builtAt : null,
  };
}

/**
 * `none` — nothing to do; `reload` — swap bundles now; `wait` — a new bundle is
 * there but a run is in flight, so hold until it finishes.
 */
export function reloadDecision(i: ReloadInput): ReloadDecision {
  if (i.own === null || i.served === null || i.own === i.served) return "none";
  if (i.dismissed) return "none";
  return i.activeRuns > 0 ? "wait" : "reload";
}

function clockOf(builtAt: string | null): string {
  if (builtAt === null) return "";
  const t = new Date(builtAt);
  if (Number.isNaN(t.getTime())) return "";
  return ` ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

/** The line shown after the reload: this tab is running the fresh build. */
export function updateNote(build: BuildInfo): UpdateNote {
  const from = build.commit === null ? "" : ` from ${build.commit.slice(0, 7)}`;
  return {
    title: "New build is running",
    detail: `rebuilt${from}${clockOf(build.builtAt)} — this tab now runs it`,
    action: null,
  };
}

/** The line shown before the reload, and while it is held by a running upload. */
export function servedNote(i: { reloading: boolean; activeRuns: number }): string {
  if (i.reloading) return "reloading this page now";
  if (i.activeRuns > 0) return "reloading when this run finishes";
  return "reloading";
}

/** Carried through `location.reload()` so the confirmation survives the swap. */
export function rememberNotice(build: BuildInfo): string {
  return JSON.stringify({ commit: build.commit, builtAt: build.builtAt });
}

/** The notice the previous page left behind, or `null` (also for junk). */
export function takeNotice(raw: string | null): UpdateNote | null {
  if (raw === null || raw === "") return null;
  try {
    const parsed = JSON.parse(raw) as { commit?: unknown; builtAt?: unknown };
    if (typeof parsed.commit !== "string" && parsed.commit !== null) return null;
    return updateNote({
      commit: typeof parsed.commit === "string" ? parsed.commit : null,
      builtAt: typeof parsed.builtAt === "string" ? parsed.builtAt : null,
    });
  } catch {
    return null;
  }
}

/**
 * A reload only helps if the page can actually pick up the new bundle. It cannot
 * when the page is not served by the helper (a copy opened from disk), and then a
 * reload would repeat forever — so one automatic reload per (own → served) pair,
 * after that the reader presses the button.
 */
export function reloadAllowed(raw: string | null, own: string, served: string): { allowed: boolean; next: string | null } {
  const seen = parseMark(raw);
  const same = seen !== null && seen.own === own && seen.served === served;
  const n = same ? seen.n : 0;
  if (n >= 1) return { allowed: false, next: null };
  return { allowed: true, next: JSON.stringify({ own, served, n: n + 1 }) };
}

interface ReloadMark {
  own: string;
  served: string;
  n: number;
}

function parseMark(raw: string | null): ReloadMark | null {
  if (raw === null) return null;
  try {
    const p = JSON.parse(raw) as Partial<ReloadMark>;
    if (typeof p.own !== "string" || typeof p.served !== "string" || typeof p.n !== "number") return null;
    return { own: p.own, served: p.served, n: p.n };
  } catch {
    return null;
  }
}

/** Said instead of reloading again: the reader has to do it by hand. */
export function stalledNote(): UpdateNote {
  return {
    title: "New build ready",
    detail: "this tab keeps the old build — press reload to pick up the new one",
    action: "Reload now",
  };
}

export const NOTICE_KEY = KEPT_KEY;
export const RELOAD_MARK_KEY = "iconsplitter-rebuild-reloads";
