// contribute.mjs — the contribute.gettyimages.com / esp.gettyimages.com page
// flow: sign in with the saved contributor credentials, create one batch, then
// hand the staged JPEG (+ optional EPS) to the page's own file input so Getty's
// uploader (not this helper) performs the transfer. Every DOM decision lives in
// driver.mjs; this file only sequences steps and waits.

import * as driver from "./driver.mjs";
import { navigate, runStep, setFiles, waitFor } from "./cdp.mjs";

const STEP_SOURCES = new Map(
  Object.entries(driver).filter(([name]) => driver.DRIVER_STEPS.includes(name)).map(([name, fn]) => [name, fn.toString()]),
);

const LOGIN_POLL_MS = 1500;
const UPLOAD_POLL_MS = 1000;

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

async function loginAttempt(connection, sessionId, creds, onProgress) {
  const info = await runDriverStep(connection, sessionId, "readPageInfo");
  if (info.signedIn) return { done: true, info };
  if (!info.loginForm.email && !info.loginForm.password) return { done: false, info };
  onProgress?.(`signing in at ${info.path}`);
  await runDriverStep(connection, sessionId, "fillLoginForm", creds);
  return { done: false, info };
}

/**
 * Signs in and waits for the Batches surface. Two calls are needed when Getty
 * asks for the e-mail first and the password on the next screen.
 */
export async function ensureSignedIn(connection, sessionId, options) {
  const deadline = Date.now() + (options.timeoutMs ?? 120000);
  let last = null;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled" };
    const attempt = await loginAttempt(connection, sessionId, options.creds, options.onProgress);
    if (attempt.done) return { ok: true, info: attempt.info };
    last = attempt.info;
    await new Promise((resolve) => setTimeout(resolve, LOGIN_POLL_MS));
  }
  const onLoginPage = Boolean(last?.loginForm?.email || last?.loginForm?.password);
  return {
    ok: false,
    code: onLoginPage ? "auth" : "timeout",
    reason: onLoginPage
      ? "Getty did not accept the saved contributor sign-in — check the e-mail/password, or start the helper with GETTY_WEB_HEADED=1 to finish an interactive verification"
      : "Getty did not show the Batches page in time",
  };
}

async function chooseSubmissionType(connection, sessionId, label, onProgress) {
  const menu = await runDriverStep(connection, sessionId, "openSubmissionTypeMenu");
  if (!menu.opened) return { ok: false, reason: "submission type menu did not open" };
  const chosen = await runDriverStep(connection, sessionId, "chooseSubmissionTypeOption", { label });
  if (!chosen.chosen) return { ok: false, reason: chosen.reason };
  onProgress?.(`submission type: ${label}`);
  return { ok: true, reason: null };
}

/** Creates one batch and waits for its upload page (URL carries the batch id). */
export async function createBatch(connection, sessionId, options) {
  if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled" };
  const opened = await runDriverStep(connection, sessionId, "openCreateBatchDialog");
  if (!opened.clicked) return { ok: false, code: "page", reason: opened.reason };
  const dialog = await waitFor(connection, "Boolean(document.querySelector('[data-cy=\"create-batch-dialog\"]'))", {
    sessionId, timeoutMs: 15000,
  });
  if (!dialog.ok) return { ok: false, code: "page", reason: "the Create Batch dialog did not open" };
  const type = await chooseSubmissionType(connection, sessionId, options.submissionType, options.onProgress);
  if (!type.ok) return { ok: false, code: "page", reason: type.reason };
  const filled = await runDriverStep(connection, sessionId, "fillBatchDetails", {
    batchName: options.batchName, briefCode: options.briefCode ?? "",
  });
  if (!filled.filled) return { ok: false, code: "page", reason: filled.reason };
  const submitted = await runDriverStep(connection, sessionId, "submitBatchCreation");
  if (!submitted.clicked) return { ok: false, code: "page", reason: submitted.reason };
  const created = await waitFor(connection, "(() => { const m = /\\/contribute\\/batches\\/(\\d+)/.exec(location.pathname); return m ? m[1] : null; })()", {
    sessionId, timeoutMs: options.timeoutMs ?? 60000,
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
  const input = await waitFor(connection, 'document.querySelectorAll(\'input[type="file"]\').length > 0', {
    sessionId, timeoutMs: 30000,
  });
  if (!input.ok) return { ok: false, code: "page", reason: "the batch page has no file input", state: null };
  const result = await setFiles(connection, options.paths, { sessionId });
  if (!result.ok) return { ok: false, code: "page", reason: result.reason, state: null };
  options.onProgress?.(`${options.paths.length} file(s) attached to the batch page`);
  return waitForFileNames(connection, sessionId, options.names, options);
}
