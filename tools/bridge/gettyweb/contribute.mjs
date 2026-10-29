// contribute.mjs — the contribute.gettyimages.com / esp.gettyimages.com page
// flow: sign in with the saved contributor credentials, create one batch, then
// hand the staged JPEG (+ optional EPS) to the page's own file input so Getty's
// uploader (not this helper) performs the transfer. Every DOM decision lives in
// driver.mjs; this file only sequences steps and waits.

import * as driver from "./driver.mjs";
import { insertText, navigate, runStep, setFiles, waitFor } from "./cdp.mjs";

const STEP_SOURCES = new Map(
  Object.entries(driver).filter(([name]) => driver.DRIVER_STEPS.includes(name)).map(([name, fn]) => [name, fn.toString()]),
);

const LOGIN_POLL_MS = 1500;
const UPLOAD_POLL_MS = 1000;
const CONFIRM_SETTLE_MS = 700;
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

function remaining(deadline) {
  return Math.max(0, deadline - Date.now());
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

async function waitForFileNames(connection, sessionId, names, options) {
  const deadline = Date.now() + (options.timeoutMs ?? 180000);
  let last = null;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", state: last };
    last = await runDriverStep(connection, sessionId, "readUploadState", { names });
    if (last.signInRequired) {
      return { ok: false, code: "auth", reason: "Getty signed the browser out during the upload", state: last };
    }
    if (last.namesSeen.length === names.length) return { ok: true, state: last };
    options.onProgress?.(`waiting for the page to accept ${names.length} file(s)`);
    await new Promise((resolve) => setTimeout(resolve, remaining(deadline) === 0 ? 0 : UPLOAD_POLL_MS));
  }
  return { ok: false, code: "timeout", reason: "Getty did not list the uploaded file names in time", state: last };
}

/** Hands the staged files to the page's uploader and waits until they appear. */
export async function attachFiles(connection, sessionId, options) {
  const input = await waitFor(connection, `Boolean(document.querySelector(${JSON.stringify(CONTRIBUTION_FILE_INPUT)}))`, {
    sessionId, timeoutMs: 60000, intervalMs: 1000,
  });
  if (!input.ok) return { ok: false, code: "page", reason: "Getty contribution uploader (Upload from device) did not become ready within 60 seconds; release inputs were not used", state: null };
  const result = await setFiles(connection, options.paths, { sessionId, selector: CONTRIBUTION_FILE_INPUT });
  if (!result.ok) return { ok: false, code: "page", reason: result.reason, state: null };
  options.onProgress?.(`${options.paths.length} file(s) attached to the batch page`);
  return waitForFileNames(connection, sessionId, options.names, options);
}

/** Opens one file's metadata editor, types the accepted text, and saves it. */
async function fillOneFileMetadata(connection, sessionId, file, options) {
  const opened = await runDriverStep(connection, sessionId, "openFileMetadata", { fileName: file.name });
  if (!opened.opened) return { name: file.name, status: "row-not-found" };
  const filled = await runDriverStep(connection, sessionId, "fillMetadataFields", {
    title: file.metadata.title, description: file.metadata.description,
    keywords: file.metadata.keywords, overwrite: false,
  });
  const saved = (await runDriverStep(connection, sessionId, "saveMetadataEditor")) ?? { saved: false, label: null };
  await runDriverStep(connection, sessionId, "closeMetadataEditor").catch(() => null);
  options.onProgress?.(`${file.name}: metadata ${saved.saved ? "saved" : "filled but no Save button"}`);
  return { name: file.name, status: saved.saved ? "saved" : "filled-unsaved", fields: filled.filled };
}

async function fillEveryFileMetadata(connection, sessionId, options) {
  const report = [];
  for (const file of options.files) {
    if (options.signal?.aborted) return { aborted: true, report };
    if (!file.metadata) {
      report.push({ name: file.name, status: "embedded-only" });
      continue;
    }
    report.push(await fillOneFileMetadata(connection, sessionId, file, options));
  }
  return { aborted: false, report };
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
