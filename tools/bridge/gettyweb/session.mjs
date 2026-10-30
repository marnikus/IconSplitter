// session.mjs — one Getty contributor browser session: launch (or attach), sign
// in once, create one batch, then attach each staged icon to that batch. The
// session is reused for every item of an Upload run so the login and the batch
// happen exactly once. Files are staged in a private temp folder that is
// deleted when the session closes; nothing is ever logged.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { connectBrowser } from "./browser.mjs";
import { openCdp } from "./cdp.mjs";
import { restoreSessionCookies, saveSessionCookies } from "./sessioncookies.mjs";
import { attachFiles, createBatch, ensureSignedIn, finalizeBatch, finishBatch, openContributePage } from "./contribute.mjs";

const LOGIN_TIMEOUT_MS = 120000;
const UPLOAD_TIMEOUT_MS = 180000;
// The whole run is attached at once, so a long run needs more than one pair's time.
const PER_EXTRA_FILE_MS = 30000;

async function openPage(connection) {
  const target = await connection.send("Target.createTarget", { url: "about:blank" });
  const attached = await connection.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  return { targetId: target.targetId, sessionId: attached.sessionId };
}

/** Turns one page reading into the counts the app's progress line shows. */
export function progressOf(read, reloads = 0) {
  const uploaded = Array.isArray(read?.uploaded) ? read.uploaded.length : 0;
  const failed = Array.isArray(read?.failed) ? read.failed.length : 0;
  const listed = Array.isArray(read?.namesSeen) ? read.namesSeen.length : 0;
  const total = listed + (Array.isArray(read?.missing) ? read.missing.length : 0);
  // Getty's own "Ready to submit" validation, the only proof a file may be sent;
  // reported only once it exists, so a reading without it stays the old shape.
  const ready = Array.isArray(read?.readyToSubmit) ? read.readyToSubmit.length : 0;
  return { total, uploaded, failed, listed, ...(ready > 0 ? { ready } : {}), reloads };
}

/** The readiness pacing a caller may inject; production keeps the real windows. */
export function readyOptionsOf(options = {}) {
  const keys = ["readyRetryMs", "readyTimeoutMs", "readyResaves", "pollMs", "settleMs", "bulkSaveSettleMs"];
  const out = {};
  for (const key of keys) if (typeof options[key] === "number") out[key] = options[key];
  return out;
}

/** How long the page may take to list `fileCount` attached files. */
export function uploadTimeoutFor(fileCount, baseMs = UPLOAD_TIMEOUT_MS) {
  const extra = Math.max(0, Number(fileCount) - 2) * PER_EXTRA_FILE_MS;
  return baseMs + extra;
}

/** Keeps the page file name but never a path segment from the user's disk. */
export function safeStagedName(fileName) {
  const leaf = String(fileName ?? "").split(/[\\/]/).pop() ?? "";
  const base = leaf.replace(/[^A-Za-z0-9._-]/g, "_");
  return base === "" || base === "." || base === ".." ? "icon.bin" : base;
}

/**
 * The icons of one request, in the shape the page flow wants: every icon owns its
 * files (JPEG first) plus the metadata typed into that icon's editor.
 */
function iconsOf(input) {
  const listed = Array.isArray(input?.icons) ? input.icons : null;
  if (listed !== null) {
    return listed.map((icon) => ({
      files: Array.isArray(icon?.files) ? icon.files : [],
      metadata: icon?.metadata ?? null,
    }));
  }
  return [{ files: Array.isArray(input?.files) ? input.files : [], metadata: input?.metadata ?? null }];
}

/** Stages every icon in its own folder; returns the staged paths per icon. */
function stageIcons(dir, icons) {
  return icons.map((icon, index) => {
    const iconDir = path.join(dir, String(index));
    mkdirSync(iconDir, { recursive: true });
    return icon.files.map((file) => {
      const target = path.join(iconDir, safeStagedName(file.name));
      writeFileSync(target, file.bytes);
      return target;
    });
  });
}

/**
 * The honest reason a launched browser's DevTools socket refused a connection —
 * a stale port or a profile another window still owns, never the raw error.
 */
export function cdpFailureReason(err, browser) {
  const port = Number(browser?.port ?? 0);
  const where = typeof browser?.profileDir === "string" && browser.profileDir !== ""
    ? `the profile folder ${browser.profileDir}`
    : "the browser's throwaway profile";
  const at = port > 0 ? ` (DevTools port ${port})` : "";
  const detail = String(err?.message ?? "").trim();
  const hint = /refused|failed|ECONNREFUSED|closed/i.test(detail)
    ? `retry the upload (the helper frees its own ${where} first)`
    : detail.slice(0, 200) || "the browser page could not be prepared";
  return `the browser opened${at} but its debugging socket did not answer — ${hint}, or set GETTY_WEB_CDP`;
}

const KEPT_OPEN = "browser window was left open — check the sign-in page it shows";

/**
 * What a failure may do to the browser. A window the user asked to see
 * (`--getty-headed`) is never killed: they have to be able to judge whether the
 * saved credentials actually signed in.
 */
export function failureOutcome(headed, reason) {
  const text = String(reason ?? "").trim() || "the browser page could not be prepared";
  return headed === true
    ? { keepOpen: true, reason: `${text} (the ${KEPT_OPEN})` }
    : { keepOpen: false, reason: text };
}

/** Lets go of a session: a visible window stays, a hidden one is closed. */
export function releaseSession(session, headed) {
  if (headed === true && typeof session?.detach === "function") {
    session.detach();
    return "kept";
  }
  session?.close();
  return "closed";
}

/** Signs in and prepares the batches page; returns a reusable session. */
export async function openGettySession(options) {
  const browser = await connectBrowser({
    headed: options.headed, cdpUrl: options.cdpUrl, profileDir: options.profileDir, env: options.env,
  });
  if (!browser.ok) return browser;
  const connection = openCdp(browser.socket);
  // A killed or relaunched window comes back logged out, so keep the cookies in
  // the profile folder: restoring them before the first navigation is what makes
  // a rerun start signed in.
  const remember = async () => {
    const kept = await saveSessionCookies(connection, options.profileDir);
    if (kept.saved > 0) options.onProgress?.(`kept ${kept.saved} Getty sign-in cookie(s) for the next run`);
    return kept;
  };
  // A visible sign-in window belongs to the user: disconnect automation, but
  // leave the page open for inspection or manual verification. A named profile
  // keeps its browser between runs either way, which is what remembers Getty's
  // sign-in; only a failure or a reset closes it (politely, so cookies land).
  const closeBrowserNow = (closing = {}) => {
    browser.stop({ keepOpen: options.headed === true, force: closing.force === true });
  };
  const cleanup = (closing = {}) => {
    // Save before letting go: this is the last moment the cookies are readable.
    void remember().finally(() => closeBrowserNow(closing));
  };
  const fail = (code, reason) => {
    const outcome = failureOutcome(options.headed, reason);
    if (outcome.keepOpen) connection.close();
    else cleanup({ force: true });
    return { ok: false, code, reason: outcome.reason, keptOpen: outcome.keepOpen };
  };
  try {
    const readyFailure = await connection.ready.then(() => null).catch((err) => err);
    if (readyFailure !== null) return fail("browser", cdpFailureReason(readyFailure, browser));
    const page = await openPage(connection);
    const remembered = await restoreSessionCookies(connection, options.profileDir);
    if (remembered.restored > 0) {
      options.onProgress?.(`restored ${remembered.restored} saved Getty sign-in cookie(s)`);
    }
    const info = await openContributePage(connection, page.sessionId, options.url);
    const signedIn = info.signedIn ? { ok: true } : await ensureSignedIn(connection, page.sessionId, {
      creds: options.creds, url: options.url, timeoutMs: options.loginTimeoutMs ?? LOGIN_TIMEOUT_MS,
      onProgress: options.onProgress, signal: options.signal,
    });
    if (!signedIn.ok) return fail(signedIn.code, signedIn.reason);
    // Signing in is when Getty sets the cookies that keep this device trusted.
    await remember();
    return { ok: true, session: buildSession({ connection, page, browser, options, cleanup }) };
  } catch (err) {
    return fail("browser", String(err?.message ?? "").trim());
  }
}

function buildSession(ctx) {
  const { connection, page, options, cleanup } = ctx;
  const tempDir = mkdtempSync(path.join(tmpdir(), "getty-web-files-"));
  const state = { batchId: null, expected: [], progress: null, reloads: 0 };
  let closed = false;
  const dropTemp = () => {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* temp already gone */ }
  };
  return {
    get batchId() { return state.batchId; },
    /** Creates the batch once for the whole run. */
    async ensureBatch(input) {
      if (state.batchId !== null) return { ok: true, batchId: state.batchId };
      const created = await createBatch(connection, page.sessionId, {
        batchName: input.batchName, submissionType: input.submissionType,
        briefCode: input.briefCode, onProgress: options.onProgress, signal: options.signal,
        timeoutMs: options.batchTimeoutMs,
      });
      if (created.ok) state.batchId = created.batchId;
      return created;
    },
    /**
     * Stages every icon of the run, then hands them to Getty in one attach — all
     * pairs at once, not one pair per page visit. Nothing is submitted here: the
     * run submits the batch once, after every icon is listed.
     */
    async upload(input) {
      const icons = iconsOf(input);
      const files = icons.flatMap((icon) => icon.files.map((file) => ({ name: file.name, metadata: icon.metadata })));
      for (const file of files) {
        if (typeof file.name === "string" && file.name !== "" && !state.expected.includes(file.name)) {
          state.expected.push(file.name);
        }
      }
      const paths = stageIcons(tempDir, icons).flat();
      state.reloads = 0;
      state.progress = { phase: "uploading", total: files.length, uploaded: 0, failed: 0, listed: 0, reloads: 0 };
      const result = await attachFiles(connection, page.sessionId, {
        paths, names: files.map((file) => file.name),
        timeoutMs: uploadTimeoutFor(files.length, options.uploadTimeoutMs ?? UPLOAD_TIMEOUT_MS),
        readyTimeoutMs: options.readyTimeoutMs,
        // Polled by the app, so the panel shows what Getty reports while it runs.
        onState: (read) => { state.progress = { ...progressOf(read, state.reloads), phase: "uploading" }; },
        onReload: (count) => { state.reloads = count; },
        onProgress: options.onProgress, signal: options.signal,
      });
      if (!result.ok) {
        state.progress = { ...progressOf(result.state, state.reloads), phase: "failed" };
        return { ...result, batchId: state.batchId };
      }
      state.progress = { ...progressOf(result.state, state.reloads), phase: "metadata" };
      const done = await finalizeBatch(connection, page.sessionId, {
        files, failed: result.state?.failed ?? [], complete: input.complete === true,
        onProgress: options.onProgress, signal: options.signal, ...readyOptionsOf(options),
      });
      // The phase says whether Getty validated every card, not just that the
      // request returned: a failed readiness leaves the run unfinished.
      state.progress = { ...progressOf(done.report?.readiness?.state ?? result.state, state.reloads), phase: done.ok ? "done" : "failed" };
      return {
        ...done, state: { ...result.state, ...done.report?.state }, report: done.report,
        accepted: result.state?.uploaded ?? [], failed: result.state?.failures ?? [], batchId: state.batchId,
      };
    },
    /**
     * Submits the one batch of the run. Every icon uploads into it; completing
     * after the first icon is what used to lock the batch and drop the rest.
     */
    async finish(input = {}) {
      const result = await finishBatch(connection, page.sessionId, {
        expected: input.expected ?? state.expected, signal: input.signal ?? options.signal,
        onProgress: options.onProgress, ...readyOptionsOf(options),
      });
      state.progress = { ...(state.progress ?? progressOf(null, state.reloads)), phase: result.ok ? "done" : "failed" };
      return result;
    },
    /** Names this session has uploaded so far, for the finish report. */
    get expected() { return [...state.expected]; },
    /** Live per-file progress of the upload, polled by the app for its panel. */
    get progress() { return state.progress ? { ...state.progress } : null; },
    close() {
      if (closed) return;
      closed = true;
      cleanup();
      dropTemp();
    },
    /**
     * Leaves a visible window on screen for whoever asked to watch it; only this
     * driver lets go (the staged files still go).
     */
    detach() {
      if (closed) return;
      closed = true;
      void saveSessionCookies(connection, options.profileDir).finally(() => {
        connection.close();
        dropTemp();
      });
    },
  };
}
