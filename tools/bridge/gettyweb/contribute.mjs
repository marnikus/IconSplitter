// contribute.mjs — the contribute.gettyimages.com / esp.gettyimages.com page
// flow: sign in with the saved contributor credentials, create one batch, then
// hand the staged JPEG (+ optional EPS) to the page's own file input so Getty's
// uploader (not this helper) performs the transfer. Every DOM decision lives in
// driver.mjs; this file only sequences steps and waits.

import * as driver from "./driver.mjs";
import { insertText, navigate, reloadPage, runStep, setFiles, waitFor } from "./cdp.mjs";

const STEP_SOURCES = new Map(
  Object.entries(driver).filter(([name]) => driver.DRIVER_STEPS.includes(name)).map(([name, fn]) => [name, fn.toString()]),
);

const LOGIN_POLL_MS = 1500;
const UPLOAD_POLL_MS = 1000;
const CONFIRM_SETTLE_MS = 700;
/** Getty needs a moment to persist a grid-wide save and refresh the cards. */
const BULK_SAVE_SETTLE_MS = 1500;
const EDITOR_POLL_MS = 500;
// Getty renders a thumbnail some time after it lists the file; twelve icons of
// full-size JPEGs take minutes, so the wait for every picture is generous.
const VERIFY_TIMEOUT_MS = 300000;
// A saved card only becomes submittable once Getty has validated it, and that
// icon is the run's success proof. When a card stays unvalidated the grid-wide
// save is pressed again after this window — the re-apply that flips it.
const READY_RETRY_MS = 30000;
const READY_RESAVES = 2;
// The gate must leave room for the two re-saves **and** for re-uploading the
// cards that still refuse to validate, so it is a whole-run window, not a teaser.
const READY_TIMEOUT_MS = 180000;
const READY_REPAIRS = 1;
// Getty stops re-reading its own validation on a page it left half rendered, and
// a fresh load is what turns those cards — the recovery that works most often.
// Bounded, and it never replaces the two re-saves or the re-upload.
const READY_RELOADS = 2;
const REPAIR_TIMEOUT_MS = 120000;
// Getty paints the metadata drawer as MUI skeletons before its contribution is
// available. A drawer that only ever shows those never unlocks, so it is a page
// reload — not a longer wait — and the walk stops there instead of moving on.
const SKELETON_TIMEOUT_MS = 8000;
// How often one metadata walk may reload the page and start again from the first
// contribution before it reports what is still missing. One retry: a big batch is
// re-opened drawer by drawer, so the readiness ladder's own reloads stay the
// outer bound rather than multiplying full walks.
const METADATA_RESTARTS = 1;
// Getty's page sometimes simply stops reacting to its own uploader. Reloading it
// (and attaching only what is still missing) is the recovery that works there.
const STALL_MS = 30000;
const MAX_RELOADS = 2;
const NAV_RETRY_MS = 5000;
// Never use the first generic file input: Getty also renders release uploaders.
// This contribution input is deliberately hidden and accepts the vector pair.
const CONTRIBUTION_FILE_INPUT = 'input[type="file"][data-cy="upload-button-file-input"][multiple]:not([disabled])';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Getty needs a beat after a click that closes an overlay (the confirmation
 * dialog, the grid-wide save). The two settle windows are injectable so a test
 * can hand in 0 instead of really waiting — production keeps the real timings.
 */
const settle = (options, key, fallback) => sleep(typeof options?.[key] === "number" ? options[key] : fallback);

/** The poll cadence of the upload waits: 1 s for Getty, injectable so a test can run at 1 ms. */
const pollMsOf = (options) => (typeof options?.pollMs === "number" ? options.pollMs : UPLOAD_POLL_MS);

/** Runs one named page step; unknown names fail loudly instead of silently. */
export function runDriverStep(connection, sessionId, name, arg) {
  const source = STEP_SOURCES.get(name);
  if (!source) return Promise.reject(new Error(`unknown page step: ${name}`));
  return runStep(connection, driver.PAGE_PRELUDE, source, arg, sessionId);
}

/** Opens the contributor app (it redirects to sign-in when needed). */
export async function openContributePage(connection, sessionId, url) {
  await navigate(connection, url, sessionId);
  return runDriverStep(connection, sessionId, "readPageInfo");
}

/**
 * Getty sometimes opens on an SSO/phone screen whose only way forward is a
 * "sign in with password" option; pick it so the saved credentials get a form.
 */
async function openPasswordOption(connection, sessionId, info) {
  const hasForm = info.loginForm.email || info.loginForm.password;
  if (hasForm || info.challenge || /^\/contribute(\/|$)/.test(String(info.path ?? ""))) return info;
  const chosen = await runDriverStep(connection, sessionId, "choosePasswordOption");
  return chosen?.chosen === true ? runDriverStep(connection, sessionId, "readPageInfo") : info;
}

/** Presses Enter into one field with real key events, when it can be focused. */
async function typeInto(connection, sessionId, which, value) {
  if (typeof value !== "string" || value === "") return false;
  const target = await runDriverStep(connection, sessionId, "focusLoginField", { which });
  if (target?.focused !== true) return false;
  return insertText(connection, value, sessionId);
}

/**
 * Types the saved credentials the way a person does — focus, then real input
 * events — and only then falls back to writing the values from the page
 * (Angular/React forms ignore a plain `.value =`).
 */
async function typeCredentials(connection, sessionId, creds) {
  const identifier = await typeInto(connection, sessionId, "identifier", creds.username);
  const password = await typeInto(connection, sessionId, "password", creds.password);
  await runDriverStep(connection, sessionId, "fillLoginForm", creds);
  return identifier || password;
}

/** Fills the visible sign-in step; presses the control again if it did not take. */
async function loginAttempt(connection, sessionId, creds, onProgress) {
  let info = await runDriverStep(connection, sessionId, "readPageInfo");
  if (info.signedIn) return { done: true, info };
  info = await openPasswordOption(connection, sessionId, info);
  if (!info.loginForm.email && !info.loginForm.password) {
    const diagnostic = await runDriverStep(connection, sessionId, "inspectSignIn");
    return { done: false, info, submitted: false, diagnostic };
  }
  onProgress?.(`signing in at ${info.path}`);
  await typeCredentials(connection, sessionId, creds);
  const again = await runDriverStep(connection, sessionId, "submitLogin");
  const diagnostic = await runDriverStep(connection, sessionId, "inspectSignIn");
  return { done: false, info, submitted: again?.submitted === true, diagnostic };
}

const SIGN_IN_TIMEOUT = "Getty did not show the Batches page in time";
const SIGN_IN_CHALLENGE = "Getty is asking for an interactive verification (captcha, 2-factor or new-device check) — run run_ftp_bridge.bat --getty-headed, sign in once in the window that opens, then retry";
const SIGN_IN_UNSENT = "the sign-in form was filled but no sign-in control could be pressed — run run_ftp_bridge.bat --getty-headed to see what the page asks for";
const SIGN_IN_ID_STEP = "Getty stayed on the account ID step — save the numeric contributor ID (or e-mail) you use on gettyimages.com, then retry";
const SIGN_IN_REJECTED = "Getty did not accept the saved contributor password — check it, or run run_ftp_bridge.bat --getty-headed to watch the sign-in";

/** One short line about the screen the run was stuck on (never a value). */
export function describeSignInPage(diagnostic) {
  if (!diagnostic) return "";
  const parts = [];
  const title = String(diagnostic.title ?? "").trim() || String(diagnostic.app ?? "").trim();
  if (title !== "") parts.push(`page "${title}"`);
  const inputs = Array.isArray(diagnostic.inputs) ? diagnostic.inputs : [];
  parts.push(inputs.length === 0 ? "no text inputs" : `${inputs.length} input(s): ${inputs.join(", ")}`);
  const buttons = Array.isArray(diagnostic.buttons) ? diagnostic.buttons.slice(0, 4) : [];
  if (buttons.length > 0) parts.push(`buttons: ${buttons.join(" / ")}`);
  if (diagnostic.angular === true) parts.push("angular-js");
  if (diagnostic.arkose === true) parts.push("human-check iframe present");
  return parts.join("; ");
}

/** The honest reason a sign-in stalled, from what the page showed. */
export function signInFailure(info, submitted, diagnostic) {
  const base = failureBase(info, submitted);
  const detail = describeSignInPage(diagnostic);
  return detail === "" ? base : { ...base, reason: `${base.reason} — the page showed: ${detail}` };
}

function failureBase(info, submitted) {
  if (!info) return { ok: false, code: "timeout", reason: SIGN_IN_TIMEOUT };
  if (info.challenge === true) return { ok: false, code: "auth", reason: SIGN_IN_CHALLENGE };
  const hasForm = info.loginForm?.email === true || info.loginForm?.password === true;
  if (!hasForm) return { ok: false, code: "timeout", reason: SIGN_IN_TIMEOUT };
  if (submitted !== true) return { ok: false, code: "auth", reason: SIGN_IN_UNSENT };
  if (info.loginForm?.email === true && info.loginForm?.password !== true) {
    return { ok: false, code: "auth", reason: SIGN_IN_ID_STEP };
  }
  return { ok: false, code: "auth", reason: SIGN_IN_REJECTED };
}

/** True when the browser sits on a Getty page that is neither sign-in nor /contribute. */
function driftedAway(info) {
  const path = String(info?.path ?? "");
  if (!info || /^\/contribute(\/|$)/.test(path)) return false;
  return info.loginForm?.email !== true && info.loginForm?.password !== true && info.challenge !== true;
}

/** Returns to the contributor page when sign-in ended on some other Getty page. */
async function revisitContributor(connection, sessionId, options, state) {
  if (options.url === undefined || Date.now() < state.nextNavAt || !driftedAway(state.last)) return;
  options.onProgress?.("returning to the contributor page");
  await navigate(connection, options.url, sessionId);
  state.nextNavAt = Date.now() + NAV_RETRY_MS;
}

/**
 * Signs in and waits for the Batches surface. Several attempts are needed when
 * Getty asks for the identifier first, the password second, or lands on another
 * page after signing in.
 */
export async function ensureSignedIn(connection, sessionId, options) {
  const deadline = Date.now() + (options.timeoutMs ?? 120000);
  const state = { last: null, submitted: false, nextNavAt: 0, diagnostic: null };
  while (Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled" };
    const attempt = await loginAttempt(connection, sessionId, options.creds, options.onProgress);
    if (attempt.done) return { ok: true, info: attempt.info };
    state.submitted = state.submitted || attempt.submitted === true;
    state.last = attempt.info;
    state.diagnostic = attempt.diagnostic ?? state.diagnostic;
    await revisitContributor(connection, sessionId, options, state);
    await sleep(options.pollMs ?? LOGIN_POLL_MS);
  }
  return signInFailure(state.last, state.submitted, state.diagnostic);
}

// Wait for rendered, enabled controls; never retry a successful click/submit.
async function waitForControl(connection, sessionId, selector, pollMs = UPLOAD_POLL_MS) {
  return waitFor(connection, `(() => {
    const controls = [...document.querySelectorAll(${JSON.stringify(selector)})];
    return controls.some(el => !el.disabled && !el.hidden
      && el.getAttribute('aria-hidden') !== 'true'
      && (typeof el.checkVisibility !== 'function' || el.checkVisibility()));
  })()`, { sessionId, timeoutMs: 60000, intervalMs: pollMs });
}

async function chooseSubmissionType(connection, sessionId, label, onProgress, pollMs = UPLOAD_POLL_MS) {
  const control = await waitForControl(connection, sessionId, '[data-cy="create-batch-submission-type"] [role="combobox"]', pollMs);
  if (!control.ok) return { ok: false, reason: "Getty submission type control did not become ready within 60 seconds" };
  const menu = await runDriverStep(connection, sessionId, "openSubmissionTypeMenu", { label });
  if (!menu.opened) return { ok: false, reason: "submission type menu did not open" };
  if (menu.selected) return { ok: true, reason: null };
  const ready = await waitFor(connection, `Boolean(document.querySelector('[role="listbox"] [role="option"]'))`, {
    sessionId, timeoutMs: 60000, intervalMs: pollMs,
  });
  if (!ready.ok) return { ok: false, reason: "Getty did not show the submission type options" };
  const chosen = await runDriverStep(connection, sessionId, "chooseSubmissionTypeOption", { label });
  if (!chosen.chosen) return { ok: false, reason: chosen.reason };
  onProgress?.(`submission type: ${label}`);
  return { ok: true, reason: null };
}

/** Creates one batch and waits for its upload page (URL carries the batch id). */
export async function createBatch(connection, sessionId, options) {
  if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled" };
  const before = await runDriverStep(connection, sessionId, "readPageInfo");
  const pollMs = pollMsOf(options);
  const ready = await waitForControl(connection, sessionId,
    `${driver.CREATE_BATCH_DIALOG_SELECTOR}, [data-cy="create-batch-button"]`, pollMs);
  if (!ready.ok) return { ok: false, code: "timeout", reason: "Getty Create Batch control did not become ready within 60 seconds" };
  const opened = await runDriverStep(connection, sessionId, "openCreateBatchDialog");
  if (!opened.clicked) return { ok: false, code: "page", reason: opened.reason };
  const dialog = await waitFor(connection, `Boolean(document.querySelector(${JSON.stringify(driver.CREATE_BATCH_DIALOG_SELECTOR)}))`, {
    sessionId, timeoutMs: 60000, intervalMs: pollMsOf(options),
  });
  if (!dialog.ok) return { ok: false, code: "page", reason: "the Create Batch dialog did not open" };
  const type = await chooseSubmissionType(connection, sessionId, options.submissionType || "iStock creative illustration", options.onProgress, pollMs);
  if (!type.ok) return { ok: false, code: "page", reason: type.reason };
  const nameReady = await waitForControl(connection, sessionId, 'input[name="submission_name"]', pollMs);
  if (!nameReady.ok) return { ok: false, code: "timeout", reason: "Getty batch name field did not become ready within 60 seconds" };
  const filled = await runDriverStep(connection, sessionId, "fillBatchDetails", {
    batchName: String(options.batchName ?? "").trim() || `IconSplitter ${new Date().toISOString()}`, briefCode: options.briefCode ?? "",
  });
  if (!filled.filled) return { ok: false, code: "page", reason: filled.reason };
  const submitReady = await waitForControl(connection, sessionId, '[data-cy="create-batch-confirm-button"]', pollMs);
  if (!submitReady.ok) return { ok: false, code: "timeout", reason: "Getty Create button did not become ready within 60 seconds" };
  const submitted = await runDriverStep(connection, sessionId, "submitBatchCreation");
  if (!submitted.clicked) return { ok: false, code: "page", reason: submitted.reason };
  const created = await waitFor(connection, `(() => {
    const m = /\\/contribute\\/batches\\/(\\d+)/.exec(location.pathname);
    return m && m[1] !== ${JSON.stringify(before.batchId ?? null)} ? m[1] : null;
  })()`, {
    sessionId, timeoutMs: options.timeoutMs ?? 60000, intervalMs: pollMsOf(options),
  });
  if (!created.ok) return { ok: false, code: "timeout", reason: "Getty did not open the new batch page" };
  options.onProgress?.(`batch ${created.value} created`);
  return { ok: true, batchId: String(created.value) };
}

/**
 * Waits until the batch page lists every file of this call, then until each card
 * proves its outcome: Getty's **picture** (or its "Ready to submit" chip) means
 * the file arrived, "Upload failed" means it did not. The picture is the earlier
 * proof and is what lets the metadata step start: the chip only appears once the
 * metadata has been saved, so waiting for it here would deadlock.
 */
async function waitForFileNames(connection, sessionId, names, options) {
  const timeoutMs = options.timeoutMs ?? 180000;
  const deadline = Date.now() + timeoutMs;
  const stallMs = options.stallMs ?? STALL_MS;
  let last = null;
  let seen = 0;
  let movedAt = Date.now();
  const reloads = options.reloadMeter ?? { count: 0 };
  while (Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", state: last };
    const read = await readStateSafe(connection, sessionId, names);
    if (read.ok) {
      last = read.state;
      options.onState?.(last);
      if (last.signInRequired) {
        return { ok: false, code: "auth", reason: "Getty signed the browser out during the upload", state: last };
      }
      if (last.namesSeen.length !== seen) {
        seen = last.namesSeen.length;
        movedAt = Date.now();
      }
      if (seen === names.length) break;
      options.onProgress?.(`Getty listed ${seen}/${names.length} file(s) — waiting for the rest`);
    } else {
      options.onProgress?.("the Getty page stopped answering — it is given another chance before the reload");
    }
    if (Date.now() - movedAt >= stallMs) {
      // Nothing has arrived for a while: reload, then re-attach only the rest.
      if (reloads.count >= MAX_RELOADS) return { ok: false, code: "page", reason: PAGE_STOPPED, state: last };
      options.onProgress?.(`no file for ${Math.round(stallMs / 1000)} s — reloading the Getty page and retrying the rest`);
      const reloaded = await reloadBatchPage(connection, sessionId, options);
      const recovered = reloaded ? await reattachMissing(connection, sessionId, last, options).catch(() => false) : false;
      if (!recovered) options.onProgress?.("the reload did not take — waiting for the page to answer again");
      movedAt = Date.now();
      continue;
    }
    await sleep(pollMsOf(options));
  }
  if (!last) return { ok: false, code: "page", reason: PAGE_STOPPED, state: null };
  if (last.namesSeen.length < names.length) {
    return {
      ok: false, code: "timeout",
      reason: `Getty listed ${last.namesSeen.length} of ${names.length} file(s) in ${Math.round(timeoutMs / 1000)} s`,
      state: last,
    };
  }
  options.onProgress?.(`Getty listed ${names.length}/${names.length} file(s)`);
  return waitForVerified(connection, sessionId, names, options, last);
}

/**
 * Reloads the batch page and hands it only the files it is still missing. A
 * reload is the documented recovery when the page stops reacting to its uploader.
 */
async function reattachMissing(connection, sessionId, last, options) {
  // A page that never answered tells us nothing: hand it every file again.
  const missing = last ? new Set((last.missing ?? []).map((name) => String(name))) : null;
  const paths = [];
  options.names.forEach((name, index) => {
    const path = options.paths?.[index];
    if (typeof path !== "string") return;
    if (missing !== null && !missing.has(name)) return;
    paths.push(path);
  });
  if (paths.length === 0) return true;
  await runDriverStep(connection, sessionId, "dismissPageDialogs").catch(() => null);
  const input = await waitFor(connection, `Boolean(document.querySelector(${JSON.stringify(CONTRIBUTION_FILE_INPUT)}))`, {
    sessionId, timeoutMs: 60000, intervalMs: pollMsOf(options),
  }).catch(() => ({ ok: false }));
  if (!input.ok) return false;
  const attached = await setFiles(connection, paths, { sessionId, selector: CONTRIBUTION_FILE_INPUT });
  if (!attached.ok) return false;
  options.onProgress?.(`re-attached ${paths.length} file(s) after the reload`);
  return true;
}

async function readState(connection, sessionId, names) {
  return runDriverStep(connection, sessionId, "readUploadState", { names });
}

/**
 * One reading that never throws. A frozen Getty tab answers a timed-out CDP
 * call instead of state; that is a stall to recover from, not the end of a run.
 */
async function readStateSafe(connection, sessionId, names) {
  try {
    return { ok: true, state: await readState(connection, sessionId, names) };
  } catch {
    return { ok: false, state: null };
  }
}

/**
 * One reload of the batch page, counted once for the whole attach so the app can
 * say how many it took. Returns whether the page came back.
 */
async function reloadBatchPage(connection, sessionId, options) {
  const meter = options.reloadMeter ?? { count: 0 };
  meter.count += 1;
  options.onReload?.(meter.count);
  const done = await reloadPage(connection, sessionId).catch(() => ({ ok: false }));
  return done?.ok !== false;
}

/** A reading a run can act on: a page that reports no cards is retried, not believed. */
function keepCards(previous, read) {
  if (!read.ok) return previous;
  if (previous?.cardsPresent !== false && read.state?.cardsPresent === false) return previous;
  return read.state;
}

/** The reason a page that neither answers nor accepts its files is given. */
const PAGE_STOPPED = "the Getty batch page stopped answering and did not accept the remaining files after a reload";

/** A file is settled once Getty finished with it: bytes in, or rejected. */
function settled(state, names) {
  return names.every((name) => state.uploaded.includes(name) || state.failed.includes(name));
}

/** Reloads a page that stopped rendering pictures, and returns its cards. */
async function reloadForPicture(connection, sessionId, names, options, last, stallMs) {
  options.onProgress?.(`no new picture for ${Math.round(stallMs / 1000)} s — reloading the Getty page`);
  await reloadBatchPage(connection, sessionId, options);
  const after = keepCards(last, await readStateSafe(connection, sessionId, names));
  options.onState?.(after);
  return after;
}

/**
 * Waits for every file to arrive, bounded, then hands the run to the metadata
 * step — which starts the moment the last picture is on the page. A file that
 * never arrives (or is rejected) is reported, never called uploaded.
 */
async function waitForVerified(connection, sessionId, names, options, first) {
  const deadline = Date.now() + (options.readyTimeoutMs ?? VERIFY_TIMEOUT_MS);
  let last = first;
  // A page that renders no contribution cards cannot show a picture at all:
  // waiting would only burn the bound, so the metadata/readiness steps report it.
  const readable = () => last?.cardsPresent !== false;
  const stallMs = options.stallMs ?? STALL_MS;
  const meter = options.reloadMeter ?? { count: 0 };
  let movedAt = Date.now();
  let moved = last?.uploaded.length ?? 0;
  while (readable() && !settled(last, names) && Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", state: last };
    options.onProgress?.(`Getty uploaded ${last.uploaded.length}/${names.length} file(s)`);
    await sleep(pollMsOf(options));
    const read = await readStateSafe(connection, sessionId, names);
    last = keepCards(last, read); // a frozen or blank tab is waited out, never reported
    options.onState?.(last);
    if (last.uploaded.length !== moved) {
      moved = last.uploaded.length;
      movedAt = Date.now();
    }
    if (Date.now() - movedAt < stallMs || meter.count >= MAX_RELOADS) continue;
    // A card listed without its picture for a whole stall window is the page
    // giving up on its own uploader: the reload is what renders it.
    last = await reloadForPicture(connection, sessionId, names, options, last, stallMs);
    moved = last.uploaded.length;
    movedAt = Date.now();
  }
  return verificationResult(names, last, options);
}

/** What the picture wait reports: every file has one, or the files that never did. */
function verificationResult(names, last, options) {
  const rejected = last.failed.length > 0 ? `, ${last.failed.length} rejected` : "";
  options.onProgress?.(`Getty uploaded ${last.uploaded.length}/${names.length} file(s)${rejected}`);
  const waiting = names.filter((name) => !last.uploaded.includes(name) && !last.failed.includes(name));
  if (waiting.length === 0) return { ok: true, state: last };
  const bound = Math.round((options.readyTimeoutMs ?? VERIFY_TIMEOUT_MS) / 1000);
  return {
    ok: false, code: "timeout", state: last,
    reason: `Getty did not show a picture for ${waiting.length} of ${names.length} file(s) after ${bound} s (${waiting.slice(0, 3).join(", ")}) — the upload is not complete`,
  };
}

/** The contribution a file belongs to; a vector pair shares one. */
function stemOf(fileName) {
  const leaf = String(fileName ?? "").split(/[\\/]/).pop() ?? "";
  const dot = leaf.lastIndexOf(".");
  return (dot > 0 ? leaf.slice(0, dot) : leaf).trim().toLowerCase();
}

/**
 * Date Created exactly as Getty's drawer renders it — "10/10/2026 00:00:00 +0000"
 * (month/day/year, midnight, UTC). The ISO date the drawer rejects is not this.
 */
export function gettyCreatedDate(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(now.getUTCMonth() + 1)}/${pad(now.getUTCDate())}/${now.getUTCFullYear()} 00:00:00 +0000`;
}

/** Hands the staged files to the page's uploader and waits until they appear. */
export async function attachFiles(connection, sessionId, options) {
  // Getty may still show the error snackbar or a dialog from the previous icon;
  // that blocks its uploader, which is how a 2-icon run stalled after the first.
  await runDriverStep(connection, sessionId, "dismissPageDialogs").catch(() => null);
  const input = await waitFor(connection, `Boolean(document.querySelector(${JSON.stringify(CONTRIBUTION_FILE_INPUT)}))`, {
    sessionId, timeoutMs: 60000, intervalMs: pollMsOf(options),
  }).catch(() => ({ ok: false }));
  if (!input.ok) return { ok: false, code: "page", reason: "Getty contribution uploader (Upload from device) did not become ready within 60 seconds; release inputs were not used", state: null };
  const result = await setFiles(connection, options.paths, { sessionId, selector: CONTRIBUTION_FILE_INPUT });
  if (!result.ok) return { ok: false, code: "page", reason: result.reason, state: null };
  options.onProgress?.(`${options.paths.length} file(s) attached to the batch page`);
  // One reload count for the whole attach: listing, pictures and cards share it.
  return waitForFileNames(connection, sessionId, options.names, { ...options, reloadMeter: { count: 0 } });
}

/**
 * Hands already-staged files back to Getty's uploader. This is the repair for a
 * contribution that never turned "Ready to submit" (or that Getty answered with
 * "Upload failed"): a second attach is what the page accepts, and re-saving the
 * same drawer would keep it stuck. Only the named files are re-attached.
 */
export async function reattachFiles(connection, sessionId, files, options = {}) {
  const list = (Array.isArray(files) ? files : []).filter((file) => typeof file?.path === "string" && file.path !== "");
  if (list.length === 0) return { ok: false, code: "bad-request", reason: "no staged copy of the file(s) left to re-upload", state: null };
  const names = list.map((file) => file.name);
  options.onProgress?.(`re-uploading ${list.length} file(s) Getty has not marked Ready to submit`);
  await runDriverStep(connection, sessionId, "dismissPageDialogs").catch(() => null);
  const input = await waitFor(connection, `Boolean(document.querySelector(${JSON.stringify(CONTRIBUTION_FILE_INPUT)}))`, {
    sessionId, timeoutMs: options.uploaderTimeoutMs ?? 60000, intervalMs: pollMsOf(options),
  }).catch(() => ({ ok: false }));
  if (!input.ok) {
    return { ok: false, code: "page", reason: "Getty's uploader did not come back for the retry — re-upload those files by hand", state: null };
  }
  const attached = await setFiles(connection, list.map((file) => file.path), { sessionId, selector: CONTRIBUTION_FILE_INPUT });
  if (!attached.ok) return { ok: false, code: "page", reason: attached.reason, state: null };
  options.onProgress?.(`${list.length} file(s) re-attached to the batch page`);
  return waitForReupload(connection, sessionId, names, options);
}

/** Waits until the re-attached files are back on the page (a picture or a chip). */
async function waitForReupload(connection, sessionId, names, options) {
  const deadline = Date.now() + (options.retryTimeoutMs ?? REPAIR_TIMEOUT_MS);
  let state = null;
  const arrived = (read) => names.every((name) => read.uploaded.includes(name) || read.failed.includes(name));
  while (Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", state };
    const read = await readStateSafe(connection, sessionId, names);
    if (read.ok) {
      state = read.state;
      options.onState?.(state);
      if (arrived(state)) return { ok: true, state };
    }
    await sleep(pollMsOf(options));
  }
  return {
    ok: false, code: "timeout", state,
    reason: `the re-uploaded file(s) did not come back on Getty's page (${names.slice(0, 3).join(", ")})`,
  };
}

/** The tag count before and after a fill, only when it moved — never expected. */
function tagsChangedOf(filled) {
  const before = filled?.keywordsBefore;
  const after = filled?.keywordsAfter;
  return typeof before === "number" && typeof after === "number" && after !== before
    ? { before, after }
    : null;
}

/** Opens one file's metadata editor, types the accepted text, and saves it. */
function wasRejected(file, options) {
  const stem = stemOf(file.name);
  return (options.failed ?? []).some((name) => stemOf(name) === stem);
}

/**
 * Waits for the drawer of the card just clicked to unlock. Until it does, Getty
 * drops every typed value, so the file would stay "not ready to submit".
 */
async function waitForEditor(connection, sessionId, options) {
  const started = Date.now();
  const editorDeadline = started + (options.editorTimeoutMs ?? 15000);
  const skeletonDeadline = started + (options.skeletonTimeoutMs ?? SKELETON_TIMEOUT_MS);
  let state = await runDriverStep(connection, sessionId, "metadataEditorReady");
  for (;;) {
    if (state?.ready === true) return { ok: true, present: true, skeleton: false };
    const now = Date.now();
    // Only skeletons and no usable field: waiting longer changes nothing.
    if (state?.skeleton === true && now >= skeletonDeadline) {
      return { ok: false, present: state.present === true, skeleton: true };
    }
    if (now >= editorDeadline || options.signal?.aborted) {
      return { ok: false, present: state?.present === true, skeleton: state?.skeleton === true };
    }
    await sleep(options.editorPollMs ?? EDITOR_POLL_MS);
    state = await runDriverStep(connection, sessionId, "metadataEditorReady");
  }
}

/**
 * Clicks the card and waits for its drawer. Getty sometimes drops the first
 * click, so the card is clicked again once before the file is given up on.
 */
async function openDrawer(connection, sessionId, file, options) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const opened = await runDriverStep(connection, sessionId, "openFileMetadata", { fileName: file.name });
    if (!opened?.opened) return { ok: false, status: "row-not-found" };
    const ready = await waitForEditor(connection, sessionId, options);
    if (ready.ok) return { ok: true };
    await runDriverStep(connection, sessionId, "closeMetadataEditor").catch(() => null);
    // A skeleton-only drawer is a half-rendered page, not a locked one: clicking
    // the card again cannot unlock it, so the caller reloads and starts over.
    if (ready.skeleton) return { ok: false, status: "editor-skeleton" };
    if (options.signal?.aborted) break;
  }
  return { ok: false, status: "editor-not-ready" };
}

/** The Date Created this file must carry: Getty's own rendering of the run's date. */
function dateForFile(file) {
  return file.metadata?.dateCreated ?? gettyCreatedDate();
}

/**
 * Whether the drawer holds the date after typing. `null` means the page did not
 * report its own values, so nothing is claimed either way.
 */
function dateApplied(filled, date) {
  const value = filled?.values?.dateCreated;
  if (typeof value === "string") return value === date;
  return filled?.present?.dateCreated === false ? false : null;
}

/** What one filled drawer is worth: saved, unsaved, or saved without the date. */
function metadataStatusOf(saved, filled, date) {
  if (saved?.saved !== true) return "filled-unsaved";
  return dateApplied(filled, date) === false ? "date-missing" : "saved";
}

/** Why a drawer was not opened, in one short line. */
function drawerNote(status) {
  return status === "row-not-found"
    ? "Getty does not list this file"
    : status === "editor-skeleton"
      ? "Getty's metadata drawer is stuck on its loading skeletons — reloading the page and walking the batch from the first file"
      : "the metadata drawer never unlocked after two clicks, so nothing was typed";
}

/** Applies one file's Date Created (and its accepted text) and saves the drawer. */
async function fillOneFileMetadata(connection, sessionId, file, options) {
  const drawer = await openDrawer(connection, sessionId, file, options);
  if (!drawer.ok) {
    options.onProgress?.(`${file.name}: ${drawerNote(drawer.status)}`);
    return { name: file.name, status: drawer.status };
  }
  const date = dateForFile(file);
  const filled = await runDriverStep(connection, sessionId, "fillMetadataFields", {
    title: file.metadata?.title ?? "", description: file.metadata?.description ?? "",
    keywords: file.metadata?.keywords ?? [], dateCreated: date, overwrite: false,
  });
  const saved = (await runDriverStep(connection, sessionId, "saveMetadataEditor")) ?? { saved: false, label: null };
  await runDriverStep(connection, sessionId, "closeMetadataEditor").catch(() => null);
  const status = metadataStatusOf(saved, filled, date);
  const tags = tagsChangedOf(filled);
  const note = status === "date-missing" ? " — its Date Created did not take" : "";
  options.onProgress?.(`${file.name}: metadata ${metadataNote(status)}${note}${tags ? ` (keywords ${tags.before} → ${tags.after})` : ""}`);
  return {
    name: file.name, status, ...(filled?.filled ? { fields: filled.filled } : {}), ...(tags ? { keywords: tags } : {}),
  };
}

/** How a drawer's outcome reads in the progress line. */
function metadataNote(status) {
  if (status === "saved") return "saved";
  return status === "filled-unsaved" ? "filled but no Save button" : status;
}

/**
 * Getty saves the whole grid at once: once every drawer has been filled, tick
 * all contributions and press "Save metadata" so one save covers every file
 * instead of a drawer-by-drawer rhythm the contributor has to watch.
 */
async function saveEverySelected(connection, sessionId, options) {
  const selection = (await runDriverStep(connection, sessionId, "selectAllContributions")) ?? { selected: 0, method: "none" };
  if (!selection.selected) {
    options.onProgress?.("no uploaded contribution could be selected — nothing to save in bulk");
    return { selected: 0, method: selection.method ?? "none", saved: false, label: null };
  }
  const saved = (await runDriverStep(connection, sessionId, "saveMetadataEditor")) ?? { saved: false, label: null };
  await settle(options, "bulkSaveSettleMs", BULK_SAVE_SETTLE_MS);
  options.onProgress?.(`${selection.selected} file(s) selected — ${saved.saved ? `"${saved.label}" applied to all` : "no Save metadata control on the selection"}`);
  return { selected: selection.selected, method: selection.method ?? "none", saved: saved.saved === true, label: saved.label ?? null };
}

/**
 * The contributions one walk may open: only a card with a picture has a drawer,
 * and a card Getty rejected has none. Everything else is walked from the first
 * file, never resumed after the one that failed.
 */
function sweepTargets(files, state) {
  if (state?.cardsPresent === false) return [];
  const pictured = Array.isArray(state?.withThumbnail) ? new Set(state.withThumbnail.map(stemOf)) : null;
  const rejected = new Set(namesOf(state?.failed).map(stemOf));
  return (Array.isArray(files) ? files : []).filter((file) => {
    const stem = stemOf(file?.name);
    if (stem === "") return false;
    return !rejected.has(stem) && (pictured === null || pictured.has(stem));
  });
}

/** The page reading a walk needs; a caller that already has one passes it in. */
async function stateForSweep(connection, sessionId, options) {
  if (options.state) return options.state;
  const names = namesOf((options.files ?? []).map((file) => file?.name));
  const read = await readStateSafe(connection, sessionId, names);
  return read.ok ? read.state : null;
}

/** Statuses that mean this file still needs its timestamp/metadata applied. */
const REPAIR_STATUSES = new Set(["editor-skeleton", "editor-not-ready", "filled-unsaved", "date-missing"]);
/** A drawer problem stops the walk: the next file is not started after it. */
const DRAWER_FAILURES = new Set(["editor-skeleton", "editor-not-ready"]);
const UNRESOLVED = new Set([...REPAIR_STATUSES, "editor-skeleton"]);
const NO_ENTRY = new Set(["row-not-found"]);

/** Keeps one entry per contribution; a page that did not list it says nothing. */
function mergeEntries(report, entries) {
  for (const entry of entries) {
    if (NO_ENTRY.has(entry.status)) continue;
    const at = report.findIndex((existing) => existing.name === entry.name);
    if (at < 0) report.push(entry); else report[at] = entry;
  }
}

/** The files of a report that still lack their timestamp or metadata. */
function unresolvedOf(report) {
  return report.filter((entry) => UNRESOLVED.has(entry.status)).map((entry) => entry.name);
}

/** The first pass: one file of the batch, named instead of opened when it has no drawer. */
async function fillTargetEntry(connection, sessionId, file, options) {
  // A file Getty rejected has no editor to fill, whatever metadata it carries.
  if (wasRejected(file, options)) return { name: file.name, status: "upload-failed" };
  // The repair walk gives every pictured contribution its date, even one whose
  // text lives only in its embedded metadata: the timestamp is still missing.
  if (!file.metadata && options.fillAll !== true) return { name: file.name, status: "embedded-only" };
  return fillOneFileMetadata(connection, sessionId, file, options);
}

/**
 * One walk over the batch, always starting at the first contribution that has a
 * picture. A skeleton drawer ends the walk immediately: the file after it must
 * not be started while this one has no timestamp.
 */
async function fillEveryFileMetadata(connection, sessionId, options) {
  const report = [];
  const done = new Set();
  for (const file of sweepTargets(options.files, options.state ?? null)) {
    if (options.signal?.aborted) return { aborted: true, halted: false, report };
    // A vector pair is one contribution: its drawer is filled once, not twice.
    const stem = stemOf(file.name);
    if (done.has(stem)) {
      report.push({ name: file.name, status: "same-contribution" });
      continue;
    }
    const entry = await fillTargetEntry(connection, sessionId, file, options);
    report.push(entry);
    if (!NO_ENTRY.has(entry.status) && entry.status !== "embedded-only" && entry.status !== "upload-failed") done.add(stem);
    if (DRAWER_FAILURES.has(entry.status)) return { aborted: false, halted: true, report };
  }
  return { aborted: false, halted: false, report };
}

/**
 * The repair walk: every contribution with a picture is opened again from the
 * **first** one, given today's Date Created (and its accepted text when there is
 * any) and saved. A drawer stuck on skeletons — or a pass that left a date or a
 * drawer unresolved — reloads the page and starts the whole walk over instead of
 * continuing from the next file, bounded by `metadataRestarts`.
 */
async function sweepMetadata(connection, sessionId, options) {
  const targets = sweepTargets(options.files, await stateForSweep(connection, sessionId, options));
  const report = [];
  let restarts = 0;
  if (options.reloadFirst === true && targets.length > 0) await reloadBatchPage(connection, sessionId, options);
  for (;;) {
    if (options.signal?.aborted) return { ok: false, aborted: true, report, restarts, bulkSave: null };
    const pass = await fillEveryFileMetadata(connection, sessionId, { ...options, files: targets, fillAll: true });
    mergeEntries(report, pass.report);
    if (pass.aborted) return { ok: false, aborted: true, report, restarts, bulkSave: null };
    if (!pass.halted && unresolvedOf(report).length === 0) break;
    if (restarts >= (options.metadataRestarts ?? METADATA_RESTARTS)) break;
    restarts += 1;
    options.onProgress?.(`walking all ${targets.length} file(s) again from the first one after a page reload`);
    await reloadBatchPage(connection, sessionId, options);
  }
  const bulkSave = anyDrawerSaved(report) ? await saveEverySelected(connection, sessionId, options).catch(() => null) : null;
  return { ok: unresolvedOf(report).length === 0, aborted: false, report, restarts, bulkSave };
}

/** Why a walk is being redone, said out loud before it starts. */
function sweepNote(report) {
  return report.some((entry) => entry.status === "editor-skeleton")
    ? "Getty's metadata drawer stayed on its loading skeleton — reloading the page and applying the timestamp and metadata to every uploaded file from the beginning"
    : "the timestamp or metadata was not applied to every file — reloading the page and walking every uploaded file again from the beginning";
}

/** The repair walk, only when the first pass left a file without its metadata. */
async function sweepWhenNeeded(connection, sessionId, options, report) {
  if (!report.some((entry) => REPAIR_STATUSES.has(entry.status))) return null;
  options.onProgress?.(sweepNote(report));
  return sweepMetadata(connection, sessionId, { ...options, reloadFirst: true });
}

/** One contribution per distinct file stem — Getty lists a JPEG/EPS pair once. */
export function contributionCount(names) {
  const stems = new Set();
  for (const name of names) {
    const stem = stemOf(name);
    if (stem !== "") stems.add(stem);
  }
  return stems.size;
}

/** How many of the run's contributions the batch page lists right now. */
export function listedContributions(expected, state) {
  const seen = new Set((state?.namesSeen ?? []).map(stemOf));
  return [...new Set(expected.map(stemOf))].filter((stem) => seen.has(stem)).length;
}

/** How many of the run's contributions Getty itself marked "Upload failed". */
export function failedContributions(expected, state) {
  const failed = new Set((state?.failed ?? []).map(stemOf));
  return [...new Set(expected.map(stemOf))].filter((stem) => failed.has(stem)).length;
}

/**
 * The run's contributions that do **not** carry Getty's "Ready to submit"
 * validation icon yet. A thumbnail only proves the bytes arrived; this icon is
 * the page's own statement that the file passed validation and may be submitted.
 */
export function notReadyContributions(expected, state) {
  const ready = new Set((state?.readyToSubmit ?? []).map(stemOf));
  return [...new Set(expected.map(stemOf))].filter((stem) => !ready.has(stem));
}

/** Why a file Getty never marked ready is reported — named, never counted only. */
function notReadyReason(pending, resaves, repairs) {
  const named = pending.slice(0, 3).join(", ");
  const saved = resaves > 0 ? ` and saving the metadata ${resaves + 1} times` : "";
  const again = repairs > 0 ? `${saved}, not even after re-uploading` : saved;
  return `Getty does not show its "Ready to submit" icon for ${pending.length} file(s) (${named})${again} — the upload is not complete`;
}

/**
 * Re-uploads the cards Getty still will not validate. Saving the same drawer a
 * third time changes nothing; a second attach is what the page responds to, and
 * its metadata is typed again right after.
 */
async function repairPending(connection, sessionId, pending, options) {
  if (typeof options.repair !== "function") return false;
  options.onProgress?.(`${pending.length} file(s) still not ready to submit — re-uploading them`);
  const done = await options.repair(pending).catch(() => null);
  if (done?.ok !== true) return false;
  await saveEverySelected(connection, sessionId, options).catch(() => null);
  return true;
}

/**
 * Waits until every contribution shows Getty's own "Ready to submit" icon, the
 * only proof that a file may be submitted. A card that stays unvalidated gets the
 * grid-wide Save metadata pressed again (only the pending ones matter), because
 * that second save is what flips it. A page that cannot report readiness at all
 * (no contribution cards, or a reading that failed) is reported as unverified
 * instead of being guessed either way.
 */
function waitForReadyToSubmit(connection, sessionId, expected, options, first) {
  const total = contributionCount(expected);
  const ctx = {
    connection, sessionId, expected, options, total, state: first ?? null,
    resaves: 0, repairs: 0, meter: { count: 0 },
    plan: readyPlan(options), nextAt: Date.now() + (options.readyRetryMs ?? READY_RETRY_MS),
  };
  return readFirst(ctx).then((ready) => ready ?? awaitReady(ctx));
}

/** The bounded recovery ladder of a card Getty will not validate: save, save, reload, re-upload, reload. */
function readyPlan(options) {
  const resaves = options.readyResaves ?? READY_RESAVES;
  const repairs = options.readyRepairs ?? READY_REPAIRS;
  const reloads = options.readyReloads ?? READY_RELOADS;
  const plan = [];
  // A fresh page is what turns these cards most often, so it comes early — after
  // one save, before the second — and never after the batch was given up on.
  for (let i = 0; i < resaves; i += 1) {
    plan.push("resave");
    if (i < reloads) plan.push("reload");
  }
  for (let i = plan.filter((step) => step === "reload").length; i < reloads; i += 1) plan.push("reload");
  for (let i = 0; i < repairs; i += 1) plan.push("repair");
  return plan;
}

/** Reads the cards once; a page with no cards at all cannot state readiness. */
async function readFirst(ctx) {
  if (ctx.state === null) {
    const read = await readStateSafe(ctx.connection, ctx.sessionId, ctx.expected);
    ctx.state = read.ok ? read.state : null;
  }
  // A page that renders no contribution cards (or did not answer) is reported
  // unverified rather than guessed either way.
  if (ctx.state !== null && ctx.state.cardsPresent !== false) return null;
  const { total } = ctx;
  return { ok: true, verified: false, ready: 0, total, notReady: [], resaves: 0, repairs: 0, state: ctx.state };
}

/** Polls the cards, taking the ladder's next step whenever a whole window passes. */
async function awaitReady(ctx) {
  for (;;) {
    const pending = notReadyContributions(ctx.expected, ctx.state);
    if (pending.length === 0) {
      return { ok: true, verified: true, ready: ctx.total, total: ctx.total, notReady: [], resaves: ctx.resaves, repairs: ctx.repairs, state: ctx.state };
    }
    if (ctx.options.signal?.aborted) return { ...refusalOf(ctx, pending), code: "cancelled", reason: "upload cancelled" };
    if (Date.now() >= (ctx.deadline ??= Date.now() + (ctx.options.readyTimeoutMs ?? READY_TIMEOUT_MS))) {
      return { ...refusalOf(ctx, pending), code: "timeout", reason: notReadyReason(pending, ctx.resaves, ctx.repairs) };
    }
    if (ctx.plan.length > 0 && Date.now() >= ctx.nextAt) {
      ctx.nextAt = Date.now() + (ctx.options.readyRetryMs ?? READY_RETRY_MS);
      await takeStep(ctx, pending, ctx.plan.shift());
      continue;
    }
    await sleep(pollMsOf(ctx.options));
    const read = await readStateSafe(ctx.connection, ctx.sessionId, ctx.expected);
    if (read.ok) {
      ctx.state = keepCards(ctx.state, read);
      // The panel's bar follows these readings: each card that turns ready while
      // the metadata is being saved is one more file the run can submit.
      ctx.options.onState?.(ctx.state);
    }
  }
}

/** The report fields of an unfinished readiness gate. */
function refusalOf(ctx, pending) {
  return { ok: false, notReady: pending, total: ctx.total, resaves: ctx.resaves, repairs: ctx.repairs, state: ctx.state };
}

/** One ladder step — re-save, reload or re-upload — then the cards are read again. */
async function takeStep(ctx, pending, action) {
  const { connection, sessionId, options } = ctx;
  if (action === "resave") {
    ctx.resaves += 1;
    options.onProgress?.(`${pending.length} file(s) are not ready to submit — saving the metadata again (${ctx.resaves}/${options.readyResaves ?? READY_RESAVES})`);
    await saveEverySelected(connection, sessionId, options).catch(() => null);
  } else if (action === "reload") {
    // Reload, then re-apply the metadata to every contribution from the first
    // one: a fresh page only re-validates a card whose metadata it was given, and
    // a drawer that never unlocked has to be walked again, not skipped.
    options.onProgress?.(`${pending.length} file(s) are not ready to submit — reloading the Getty page, then walking every file from the beginning`);
    const back = await reloadBatchPage(connection, sessionId, { ...options, reloadMeter: ctx.meter });
    if (back) {
      // One walk after the reload: the ladder itself is the outer retry bound.
      await sweepMetadata(connection, sessionId, {
        ...options, state: ctx.state, reloadMeter: ctx.meter, metadataRestarts: 0,
      }).catch(() => null);
    }
  } else {
    // Two re-saves were not enough: re-upload the cards instead of sitting on a
    // drawer Getty clearly will not validate. Its metadata is re-applied after.
    ctx.repairs += 1;
    await repairPending(connection, sessionId, pending, options);
  }
  const reread = await readStateSafe(connection, sessionId, ctx.expected);
  if (reread.ok) {
    ctx.state = keepCards(ctx.state, reread);
    options.onState?.(ctx.state);
  }
}

/** The readiness part of a report: what Getty marked, and how often it was asked. */
function readinessReport(readiness) {
  return {
    ok: readiness.ok === true, verified: readiness.verified !== false,
    ready: readiness.ready ?? 0, total: readiness.total ?? 0,
    notReady: readiness.notReady ?? [], resaves: readiness.resaves ?? 0, repairs: readiness.repairs ?? 0,
  };
}

/** A batch Getty does not offer a Complete/Submit control for, at all. */
const NO_COMPLETION = { clicked: false, label: null, confirmed: false, confirmLabel: null };

/**
 * Clicks Complete/Submit when it can be clicked and accepts whatever dialog it
 * raises. Returns null when the control was not clickable, so the caller can
 * decide: an unvalidated file is a refusal, a validated one is simply finished.
 */
async function clickComplete(connection, sessionId, options) {
  const clicked = await runDriverStep(connection, sessionId, "completeBatch");
  if (!clicked?.clicked) return null;
  await settle(options, "settleMs", CONFIRM_SETTLE_MS);
  const confirmed = await runDriverStep(connection, sessionId, "confirmCompletion").catch(() => null);
  await settle(options, "settleMs", CONFIRM_SETTLE_MS);
  const after = await runDriverStep(connection, sessionId, "readCompletionState");
  options.onProgress?.(after.submitted ? "Getty shows the batch as submitted" : `batch completion sent (${clicked.label})`);
  return {
    completion: { clicked: true, label: clicked.label, confirmed: confirmed?.confirmed === true, confirmLabel: confirmed?.label ?? null },
    state: { submitted: after.submitted, canComplete: after.canComplete },
  };
}

/**
 * The captured batch page has no Complete/Submit control at all. Every icon
 * carrying Getty's "Ready to submit" validation then *is* the finished state:
 * nothing is left for the helper to click, and reporting an error there is what
 * made a finished run look failed.
 */
async function finishOnIcons(connection, sessionId, expected, options, state) {
  const readiness = await waitForReadyToSubmit(connection, sessionId, expected, options, state);
  const report = {
    metadata: [], readiness: readinessReport(readiness), completion: NO_COMPLETION,
    state: { submitted: false, canComplete: false },
    contributions: { expected: contributionCount(expected), listed: contributionCount(expected) - readiness.notReady.length },
  };
  if (!readiness.ok) {
    return {
      ok: false, code: readiness.code ?? "timeout", report, state: readiness.state ?? state,
      reason: `Getty shows no Complete/Submit control and ${readiness.reason}`,
    };
  }
  options.onProgress?.(readiness.verified
    ? "every file shows Ready to submit — Getty has no Complete button here, so this batch is finished"
    : "Getty shows no Complete button and no contribution cards — nothing is left to click on this batch");
  return { ok: true, report };
}

/**
 * Getty enables Complete only once it has the files; a click on a disabled
 * control does nothing, so the wait is honest and bounded instead of silent.
 */
async function waitForCompletionEnabled(connection, sessionId, options) {
  const timeoutMs = options.completeTimeoutMs ?? 120000;
  const deadline = Date.now() + timeoutMs;
  let last = await runDriverStep(connection, sessionId, "completionState");
  while (!last.enabled && Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled" };
    options.onProgress?.("waiting for Getty to enable Complete");
    await sleep(pollMsOf(options));
    last = await runDriverStep(connection, sessionId, "completionState");
  }
  if (last.enabled) return { ok: true };
  return {
    ok: false, code: "timeout",
    reason: last.present
      ? `Getty has not enabled its ${last.label ?? "Complete"} control after ${Math.round(timeoutMs / 1000)} s — the files may still be processing, so finish the batch on the contributor page`
      : "Getty does not show a Complete/Submit control on this batch — finish it on the contributor page",
  };
}

/** The file names a step speaks about; anything that is not a name is ignored. */
function namesOf(value) {
  return (Array.isArray(value) ? value : []).filter((name) => typeof name === "string" && name !== "");
}

/**
 * Why the batch must not be clicked yet — a contribution still missing, or one
 * Getty answered with "Upload failed" (submitting would lock that icon out).
 */
function finishRefusal(expected, state, total, listed) {
  if (total > 0 && listed < total) {
    return {
      ok: false, code: "timeout", state,
      reason: `Getty lists ${listed} of ${total} contribution(s) — not completing the batch`,
    };
  }
  const failed = failedContributions(expected, state);
  if (failed === 0) return null;
  return {
    ok: false, code: "page", state,
    reason: `Getty reports "Upload failed" for ${failed} of ${total} contribution(s) — remove or re-upload them, then finish the batch`,
  };
}

/**
 * Ends the run: submits the one batch every icon was uploaded into. Refuses when a
 * contribution of the run is not on the page yet, because submitting early locks
 * the batch and leaves the remaining icons out — the bug that dropped icon 2. On a
 * page without a Complete/Submit control the cards' own "Ready to submit" icons
 * decide: all ready means the run is finished, so no control is not an error.
 */
export async function finishBatch(connection, sessionId, options = {}) {
  if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled" };
  const expected = namesOf(options.expected);
  const total = contributionCount(expected);
  const state = await runDriverStep(connection, sessionId, "readUploadState", { names: expected });
  const listed = listedContributions(expected, state);
  const refusal = finishRefusal(expected, state, total, listed);
  if (refusal !== null) return refusal;
  await runDriverStep(connection, sessionId, "dismissPageDialogs").catch(() => null);
  // A file Getty never validated may not be submitted, whatever the control says:
  // the icon, not a button being enabled, is what proves the run is done.
  const control = await runDriverStep(connection, sessionId, "completionState");
  if (!control?.present) return finishOnIcons(connection, sessionId, expected, options, state);
  if (state?.cardsPresent !== false && notReadyContributions(expected, state).length > 0) {
    const readiness = await waitForReadyToSubmit(connection, sessionId, expected, options, state);
    if (!readiness.ok) {
      return { ok: false, code: readiness.code ?? "timeout", reason: readiness.reason, state: readiness.state ?? state };
    }
  }
  const ready = await waitForCompletionEnabled(connection, sessionId, options);
  if (!ready.ok) return { ...ready, state };
  const done = await clickComplete(connection, sessionId, options);
  if (done === null) return { ok: false, code: "page", reason: "could not find the batch Complete/Submit control", state };
  return { ok: true, report: { metadata: [], ...done, contributions: { expected: total, listed } } };
}

/**
 * Re-uploads the cards Getty answered with "Upload failed" and reports the ones
 * that stay rejected. A rejected card has no editor to save, so re-attaching the
 * file is the only thing that can turn it into a submittable contribution.
 */
async function repairRejected(connection, sessionId, rejected, options) {
  if (rejected.length === 0) return [];
  if (typeof options.repair !== "function") return rejected;
  options.onProgress?.(`Getty rejected ${rejected.length} file(s) — re-uploading them instead of giving up`);
  const done = await options.repair(rejected).catch(() => null);
  if (done?.ok !== true) return rejected;
  const read = await readStateSafe(connection, sessionId, rejected);
  const state = read.ok ? read.state : null;
  options.onState?.(state);
  return state === null ? rejected : rejected.filter((name) => failedContributions([name], state) > 0);
}

/** Whether any drawer was filled, i.e. whether a grid-wide save is worth it. */
function anyDrawerSaved(report) {
  return report.some((entry) => entry.status === "saved" || entry.status === "filled-unsaved");
}

/**
 * A batch Getty offers no clickable Complete/Submit control for. Every icon
 * carrying the "Ready to submit" validation is then a finished run; only an
 * unvalidated or unreadable page is a refusal.
 */
async function finishValidated(connection, sessionId, options, report, readiness) {
  const done = await clickComplete(connection, sessionId, options);
  if (done !== null) {
    report.completion = done.completion;
    report.state = done.state;
    return { ok: true, report };
  }
  if (readiness.verified === true) {
    report.completion = NO_COMPLETION;
    report.state = { submitted: false, canComplete: false };
    options.onProgress?.("every file shows Ready to submit — Getty has no Complete button here, so this batch is finished");
    return { ok: true, report };
  }
  return {
    ok: false, code: "page", report,
    reason: "Getty shows no Complete/Submit control and the batch page lists no contribution cards — finish it on the contributor page",
  };
}

/**
 * The automatic tail of a run: type each icon's accepted title/description/
 * keywords into its editor (never overwriting what Getty prefilled), save the
 * grid once, then wait for Getty's own "Ready to submit" icon on every card —
 * that icon, not the thumbnail, is what proves the file may be submitted.
 */
export async function finalizeBatch(connection, sessionId, options) {
  const filled = await fillEveryFileMetadata(connection, sessionId, options);
  const report = { metadata: filled.report, bulkSave: null, readiness: null, completion: null, state: null, sweeps: 0 };
  if (filled.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", report };
  // The dates and text are in every drawer, so one save now covers all the files.
  if (anyDrawerSaved(filled.report)) report.bulkSave = await saveEverySelected(connection, sessionId, options);
  // A drawer Getty never rendered (or a date that did not take) is repaired by a
  // reload and a full walk of the batch from its first file — never by moving on.
  const sweep = await sweepWhenNeeded(connection, sessionId, options, filled.report);
  if (sweep !== null) {
    report.sweeps = sweep.restarts + 1;
    report.bulkSave = sweep.bulkSave ?? report.bulkSave;
    mergeEntries(report.metadata, sweep.report);
    if (sweep.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", report };
  }
  const rejected = namesOf(options.failed);
  const stillRejected = await repairRejected(connection, sessionId, rejected, options);
  if (stillRejected.length > 0) {
    // Submitting a batch that still shows "Upload failed" cards locks those icons out.
    return {
      ok: false, code: "page", report,
      reason: `Getty reports "Upload failed" for ${stillRejected.length} file(s) (${stillRejected.slice(0, 3).join(", ")}) — the batch is not completed`,
    };
  }
  const names = namesOf((options.files ?? []).map((file) => file?.name));
  const readiness = await waitForReadyToSubmit(connection, sessionId, names, options);
  report.readiness = readinessReport(readiness);
  if (!readiness.ok) return { ok: false, code: readiness.code ?? "timeout", reason: readiness.reason, report };
  if (options.complete === false) return { ok: true, report };
  return finishValidated(connection, sessionId, options, report, readiness);
}
