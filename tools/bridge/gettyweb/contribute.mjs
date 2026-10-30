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
const EDITOR_POLL_MS = 500;
// Getty renders a thumbnail some time after it lists the file; twelve icons of
// full-size JPEGs take minutes, so the wait for every picture is generous.
const VERIFY_TIMEOUT_MS = 300000;
// Getty's page sometimes simply stops reacting to its own uploader. Reloading it
// (and attaching only what is still missing) is the recovery that works there.
const STALL_MS = 30000;
const MAX_RELOADS = 2;
const NAV_RETRY_MS = 5000;
// Never use the first generic file input: Getty also renders release uploaders.
// This contribution input is deliberately hidden and accepts the vector pair.
const CONTRIBUTION_FILE_INPUT = 'input[type="file"][data-cy="upload-button-file-input"][multiple]:not([disabled])';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
async function waitForControl(connection, sessionId, selector) {
  return waitFor(connection, `(() => {
    const controls = [...document.querySelectorAll(${JSON.stringify(selector)})];
    return controls.some(el => !el.disabled && !el.hidden
      && el.getAttribute('aria-hidden') !== 'true'
      && (typeof el.checkVisibility !== 'function' || el.checkVisibility()));
  })()`, { sessionId, timeoutMs: 60000, intervalMs: 1000 });
}

async function chooseSubmissionType(connection, sessionId, label, onProgress) {
  const control = await waitForControl(connection, sessionId, '[data-cy="create-batch-submission-type"] [role="combobox"]');
  if (!control.ok) return { ok: false, reason: "Getty submission type control did not become ready within 60 seconds" };
  const menu = await runDriverStep(connection, sessionId, "openSubmissionTypeMenu", { label });
  if (!menu.opened) return { ok: false, reason: "submission type menu did not open" };
  if (menu.selected) return { ok: true, reason: null };
  const ready = await waitFor(connection, `Boolean(document.querySelector('[role="listbox"] [role="option"]'))`, {
    sessionId, timeoutMs: 60000, intervalMs: 1000,
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
  const ready = await waitForControl(connection, sessionId,
    `${driver.CREATE_BATCH_DIALOG_SELECTOR}, [data-cy="create-batch-button"]`);
  if (!ready.ok) return { ok: false, code: "timeout", reason: "Getty Create Batch control did not become ready within 60 seconds" };
  const opened = await runDriverStep(connection, sessionId, "openCreateBatchDialog");
  if (!opened.clicked) return { ok: false, code: "page", reason: opened.reason };
  const dialog = await waitFor(connection, `Boolean(document.querySelector(${JSON.stringify(driver.CREATE_BATCH_DIALOG_SELECTOR)}))`, {
    sessionId, timeoutMs: 60000, intervalMs: 1000,
  });
  if (!dialog.ok) return { ok: false, code: "page", reason: "the Create Batch dialog did not open" };
  const type = await chooseSubmissionType(connection, sessionId, options.submissionType || "iStock creative illustration", options.onProgress);
  if (!type.ok) return { ok: false, code: "page", reason: type.reason };
  const nameReady = await waitForControl(connection, sessionId, 'input[name="submission_name"]');
  if (!nameReady.ok) return { ok: false, code: "timeout", reason: "Getty batch name field did not become ready within 60 seconds" };
  const filled = await runDriverStep(connection, sessionId, "fillBatchDetails", {
    batchName: String(options.batchName ?? "").trim() || `IconSplitter ${new Date().toISOString()}`, briefCode: options.briefCode ?? "",
  });
  if (!filled.filled) return { ok: false, code: "page", reason: filled.reason };
  const submitReady = await waitForControl(connection, sessionId, '[data-cy="create-batch-confirm-button"]');
  if (!submitReady.ok) return { ok: false, code: "timeout", reason: "Getty Create button did not become ready within 60 seconds" };
  const submitted = await runDriverStep(connection, sessionId, "submitBatchCreation");
  if (!submitted.clicked) return { ok: false, code: "page", reason: submitted.reason };
  const created = await waitFor(connection, `(() => {
    const m = /\\/contribute\\/batches\\/(\\d+)/.exec(location.pathname);
    return m && m[1] !== ${JSON.stringify(before.batchId ?? null)} ? m[1] : null;
  })()`, {
    sessionId, timeoutMs: options.timeoutMs ?? 60000, intervalMs: 1000,
  });
  if (!created.ok) return { ok: false, code: "timeout", reason: "Getty did not open the new batch page" };
  options.onProgress?.(`batch ${created.value} created`);
  return { ok: true, batchId: String(created.value) };
}

/**
 * Waits until the batch page lists every file of this call, then until each card
 * proves its outcome: a thumbnail means Getty took the file, "Upload failed"
 * means it did not. Only those two states are terminal — a listed row without a
 * picture is still on its way.
 */
async function waitForFileNames(connection, sessionId, names, options) {
  const timeoutMs = options.timeoutMs ?? 180000;
  const deadline = Date.now() + timeoutMs;
  const stallMs = options.stallMs ?? STALL_MS;
  let last = null;
  let seen = 0;
  let movedAt = Date.now();
  let reloads = 0;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", state: last };
    last = await readState(connection, sessionId, names);
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
    if (Date.now() - movedAt >= stallMs) {
      // Nothing has arrived for a while: reload, then re-attach only the rest.
      const stuckReason = "the Getty batch page stopped reacting and did not accept the remaining files after a reload";
      if (reloads >= MAX_RELOADS) return { ok: false, code: "page", reason: stuckReason, state: last };
      reloads += 1;
      options.onProgress?.(`no file for ${Math.round(stallMs / 1000)} s — reloading the Getty page and retrying the rest`);
      const recovered = await reloadAndRetry(connection, sessionId, last, options);
      if (!recovered) return { ok: false, code: "page", reason: stuckReason, state: last };
      options.onReload?.(reloads);
      movedAt = Date.now();
      continue;
    }
    await sleep(UPLOAD_POLL_MS);
  }
  if (!last || last.namesSeen.length < names.length) {
    return {
      ok: false, code: "timeout",
      reason: `Getty listed ${last?.namesSeen.length ?? 0} of ${names.length} file(s) in ${Math.round(timeoutMs / 1000)} s`,
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
async function reloadAndRetry(connection, sessionId, last, options) {
  const reloaded = await reloadPage(connection, sessionId);
  if (!reloaded.ok) return false;
  const missing = new Set((last?.missing ?? []).map((name) => String(name)));
  const paths = [];
  const names = [];
  options.names.forEach((name, index) => {
    const path = options.paths?.[index];
    if (!missing.has(name) || typeof path !== "string") return;
    paths.push(path); names.push(name);
  });
  if (paths.length === 0) return true;
  await runDriverStep(connection, sessionId, "dismissPageDialogs").catch(() => null);
  const input = await waitFor(connection, `Boolean(document.querySelector(${JSON.stringify(CONTRIBUTION_FILE_INPUT)}))`, {
    sessionId, timeoutMs: 60000, intervalMs: 1000,
  });
  if (!input.ok) return false;
  const attached = await setFiles(connection, paths, { sessionId, selector: CONTRIBUTION_FILE_INPUT });
  if (!attached.ok) return false;
  options.onProgress?.(`re-attached ${paths.length} file(s) after the reload`);
  return true;
}

async function readState(connection, sessionId, names) {
  return runDriverStep(connection, sessionId, "readUploadState", { names });
}

function settled(state, names) {
  return names.every((name) => state.uploaded.includes(name) || state.failed.includes(name));
}

/**
 * Recognition plus the thumbnail take a moment; a failed card is terminal at
 * once. Anything unresolved after the bound is reported, never called uploaded.
 */
async function waitForVerified(connection, sessionId, names, options, first) {
  const deadline = Date.now() + (options.readyTimeoutMs ?? VERIFY_TIMEOUT_MS);
  let last = first;
  while (!settled(last, names) && Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", state: last };
    options.onProgress?.(`Getty uploaded ${last.uploaded.length}/${names.length} file(s)`);
    await sleep(UPLOAD_POLL_MS);
    last = await readState(connection, sessionId, names);
    options.onState?.(last);
  }
  const stuck = names.length - last.uploaded.length - last.failed.length;
  const rejected = last.failed.length > 0 ? `, ${last.failed.length} rejected` : "";
  options.onProgress?.(`Getty uploaded ${last.uploaded.length}/${names.length} file(s)${rejected}`);
  if (stuck > 0) {
    options.onProgress?.(`${stuck} file(s) are still processing — the upload is not complete`);
    // A listed card with no thumbnail is not an upload: reporting success here is
    // what left cards stuck at "not ready to submit" while the run said it was done.
    const waiting = names.filter((name) => !last.uploaded.includes(name) && !last.failed.includes(name));
    return {
      ok: false, code: "timeout", state: last,
      reason: `Getty listed ${stuck} of ${names.length} file(s) without a thumbnail after ${Math.round((options.readyTimeoutMs ?? VERIFY_TIMEOUT_MS) / 1000)} s (${waiting.slice(0, 3).join(", ")}) — the upload is not complete`,
    };
  }
  return { ok: true, state: last };
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
    sessionId, timeoutMs: 60000, intervalMs: 1000,
  });
  if (!input.ok) return { ok: false, code: "page", reason: "Getty contribution uploader (Upload from device) did not become ready within 60 seconds; release inputs were not used", state: null };
  const result = await setFiles(connection, options.paths, { sessionId, selector: CONTRIBUTION_FILE_INPUT });
  if (!result.ok) return { ok: false, code: "page", reason: result.reason, state: null };
  options.onProgress?.(`${options.paths.length} file(s) attached to the batch page`);
  return waitForFileNames(connection, sessionId, options.names, options);
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
  const deadline = Date.now() + (options.editorTimeoutMs ?? 15000);
  let state = await runDriverStep(connection, sessionId, "metadataEditorReady");
  while (state?.ready === false && Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false };
    await sleep(options.editorPollMs ?? EDITOR_POLL_MS);
    state = await runDriverStep(connection, sessionId, "metadataEditorReady");
  }
  return { ok: state?.ready !== false, present: state?.present === true };
}

/** Opens one file's metadata editor, types the accepted text, and saves it. */
async function fillOneFileMetadata(connection, sessionId, file, options) {
  const opened = await runDriverStep(connection, sessionId, "openFileMetadata", { fileName: file.name });
  if (!opened.opened) return { name: file.name, status: "row-not-found" };
  const ready = await waitForEditor(connection, sessionId, options);
  if (!ready.ok) {
    await runDriverStep(connection, sessionId, "closeMetadataEditor").catch(() => null);
    options.onProgress?.(`${file.name}: the metadata drawer never unlocked`);
    return { name: file.name, status: "editor-not-ready" };
  }
  const filled = await runDriverStep(connection, sessionId, "fillMetadataFields", {
    title: file.metadata.title, description: file.metadata.description,
    keywords: file.metadata.keywords, dateCreated: file.metadata.dateCreated ?? gettyCreatedDate(), overwrite: false,
  });
  const saved = (await runDriverStep(connection, sessionId, "saveMetadataEditor")) ?? { saved: false, label: null };
  await runDriverStep(connection, sessionId, "closeMetadataEditor").catch(() => null);
  const tags = tagsChangedOf(filled);
  options.onProgress?.(`${file.name}: metadata ${saved.saved ? "saved" : "filled but no Save button"}${tags ? ` (keywords ${tags.before} → ${tags.after})` : ""}`);
  return { name: file.name, status: saved.saved ? "saved" : "filled-unsaved", fields: filled.filled, ...(tags ? { keywords: tags } : {}) };
}

async function fillEveryFileMetadata(connection, sessionId, options) {
  const report = [];
  const done = new Set();
  for (const file of options.files) {
    if (options.signal?.aborted) return { aborted: true, report };
    if (!file.metadata) {
      report.push({ name: file.name, status: "embedded-only" });
      continue;
    }
    // A file Getty rejected has no editor to fill.
    if (wasRejected(file, options)) {
      report.push({ name: file.name, status: "upload-failed" });
      continue;
    }
    // A vector pair is one contribution: its drawer is filled once, not twice.
    const stem = stemOf(file.name);
    if (done.has(stem)) {
      report.push({ name: file.name, status: "same-contribution" });
      continue;
    }
    done.add(stem);
    report.push(await fillOneFileMetadata(connection, sessionId, file, options));
  }
  return { aborted: false, report };
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
    await sleep(UPLOAD_POLL_MS);
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

/**
 * Ends the run: submits the one batch every icon was uploaded into. Refuses when a
 * contribution of the run is not on the page yet, because submitting early locks
 * the batch and leaves the remaining icons out — the bug that dropped icon 2.
 */
export async function finishBatch(connection, sessionId, options = {}) {
  if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled" };
  const expected = (Array.isArray(options.expected) ? options.expected : [])
    .filter((name) => typeof name === "string" && name !== "");
  const total = contributionCount(expected);
  const state = await runDriverStep(connection, sessionId, "readUploadState", { names: expected });
  const listed = listedContributions(expected, state);
  if (total > 0 && listed < total) {
    return {
      ok: false, code: "timeout",
      reason: `Getty lists ${listed} of ${total} contribution(s) — not completing the batch`, state,
    };
  }
  const failed = failedContributions(expected, state);
  if (failed > 0) {
    return {
      ok: false, code: "page",
      reason: `Getty reports "Upload failed" for ${failed} of ${total} contribution(s) — remove or re-upload them, then finish the batch`, state,
    };
  }
  await runDriverStep(connection, sessionId, "dismissPageDialogs").catch(() => null);
  const ready = await waitForCompletionEnabled(connection, sessionId, options);
  if (!ready.ok) return { ...ready, state };
  const clicked = await runDriverStep(connection, sessionId, "completeBatch");
  if (!clicked?.clicked) {
    return { ok: false, code: "page", reason: "could not find the batch Complete/Submit control", state };
  }
  await sleep(CONFIRM_SETTLE_MS);
  const confirmed = await runDriverStep(connection, sessionId, "confirmCompletion").catch(() => null);
  await sleep(CONFIRM_SETTLE_MS);
  const after = await runDriverStep(connection, sessionId, "readCompletionState");
  options.onProgress?.(after.submitted ? "Getty shows the batch as submitted" : `batch completion sent (${clicked.label})`);
  return {
    ok: true,
    report: {
      metadata: [],
      completion: { clicked: true, label: clicked.label, confirmed: confirmed?.confirmed === true, confirmLabel: confirmed?.label ?? null },
      state: { submitted: after.submitted, canComplete: after.canComplete },
      contributions: { expected: total, listed },
    },
  };
}

/**
 * The automatic tail of a run: type each icon's accepted title/description/
 * keywords into its editor (never overwriting what Getty prefilled), then
 * click Complete/Submit and accept its confirmation dialog.
 */
export async function finalizeBatch(connection, sessionId, options) {
  const filled = await fillEveryFileMetadata(connection, sessionId, options);
  const report = { metadata: filled.report, completion: null, state: null };
  if (filled.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", report };
  if (options.complete === false) return { ok: true, report };
  const failed = (options.failed ?? []).length;
  if (failed > 0) {
    // Submitting a batch that still shows "Upload failed" cards locks those icons out.
    return { ok: false, code: "page", reason: `Getty reports "Upload failed" for ${failed} file(s) — the batch is not completed`, report };
  }
  const clicked = await runDriverStep(connection, sessionId, "completeBatch");
  if (!clicked.clicked) {
    return { ok: false, code: "page", reason: "could not find the batch Complete/Submit control", report };
  }
  await sleep(CONFIRM_SETTLE_MS);
  const confirmed = await runDriverStep(connection, sessionId, "confirmCompletion");
  await sleep(CONFIRM_SETTLE_MS);
  const state = await runDriverStep(connection, sessionId, "readCompletionState");
  report.completion = {
    clicked: true, label: clicked.label, confirmed: confirmed.confirmed, confirmLabel: confirmed.label,
  };
  report.state = { submitted: state.submitted, canComplete: state.canComplete };
  options.onProgress?.(state.submitted ? "Getty shows the batch as submitted" : `batch completion sent (${clicked.label})`);
  return { ok: true, report };
}
