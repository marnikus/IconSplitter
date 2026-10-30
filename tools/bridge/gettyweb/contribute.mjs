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
const READY_TIMEOUT_MS = 75000;
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
  let reloads = 0;
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
      if (reloads >= MAX_RELOADS) return { ok: false, code: "page", reason: PAGE_STOPPED, state: last };
      reloads += 1;
      options.onProgress?.(`no file for ${Math.round(stallMs / 1000)} s — reloading the Getty page and retrying the rest`);
      const recovered = await reloadAndRetry(connection, sessionId, last, options).catch(() => false);
      options.onReload?.(reloads);
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
async function reloadAndRetry(connection, sessionId, last, options) {
  const reloaded = await reloadPage(connection, sessionId).catch(() => ({ ok: false }));
  if (!reloaded.ok) return false;
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

/** The reason a page that neither answers nor accepts its files is given. */
const PAGE_STOPPED = "the Getty batch page stopped answering and did not accept the remaining files after a reload";

/** A file is settled once Getty finished with it: bytes in, or rejected. */
function settled(state, names) {
  return names.every((name) => state.uploaded.includes(name) || state.failed.includes(name));
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
  while (readable() && !settled(last, names) && Date.now() < deadline) {
    if (options.signal?.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", state: last };
    options.onProgress?.(`Getty uploaded ${last.uploaded.length}/${names.length} file(s)`);
    await sleep(pollMsOf(options));
    const read = await readStateSafe(connection, sessionId, names);
    if (!read.ok) continue; // a frozen tab is waited out, never reported as uploaded
    last = read.state;
    options.onState?.(last);
  }
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
    if (options.signal?.aborted) break;
  }
  return { ok: false, status: "editor-not-ready" };
}

/** Opens one file's metadata editor, types the accepted text, and saves it. */
async function fillOneFileMetadata(connection, sessionId, file, options) {
  const drawer = await openDrawer(connection, sessionId, file, options);
  if (!drawer.ok) {
    options.onProgress?.(`${file.name}: ${drawer.status === "row-not-found"
      ? "Getty does not list this file" : "the metadata drawer never unlocked after two clicks, so nothing was typed"}`);
    return { name: file.name, status: drawer.status };
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

async function fillEveryFileMetadata(connection, sessionId, options) {
  const report = [];
  const done = new Set();
  for (const file of options.files) {
    if (options.signal?.aborted) return { aborted: true, report };
    // A file Getty rejected has no editor to fill, whatever metadata it carries.
    if (wasRejected(file, options)) {
      report.push({ name: file.name, status: "upload-failed" });
      continue;
    }
    if (!file.metadata) {
      report.push({ name: file.name, status: "embedded-only" });
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
 * The run's contributions that do **not** carry Getty's "Ready to submit"
 * validation icon yet. A thumbnail only proves the bytes arrived; this icon is
 * the page's own statement that the file passed validation and may be submitted.
 */
export function notReadyContributions(expected, state) {
  const ready = new Set((state?.readyToSubmit ?? []).map(stemOf));
  // A card Getty rejected can never turn ready: counting it as pending is what made
  // the readiness step wait for it instead of pursuing the file still lagging.
  const failed = new Set((state?.failed ?? []).map(stemOf));
  return [...new Set(expected.map(stemOf))].filter((stem) => !ready.has(stem) && !failed.has(stem));
}

/** A page that renders no cards cannot state readiness at all — never a pass. */
const NOT_READABLE = "Getty's batch page lists no contribution cards, so its \"Ready to submit\" state cannot be read — check the batch on the contributor page";

/** The readiness pacing of one run: how long, how often, how many saves. */
function readyPlan(options, expected) {
  const budget = options.readyTimeoutMs ?? READY_TIMEOUT_MS;
  return {
    retryMs: options.readyRetryMs ?? READY_RETRY_MS,
    maxResaves: options.readyResaves ?? READY_RESAVES,
    total: contributionCount(expected),
    budget,
    // Progress extends the window, but never past this: a dead page must end.
    ceiling: Date.now() + (options.readyCeilingMs ?? budget * 2),
  };
}

/** Why a file Getty never marked ready is reported — named, never counted only. */
function notReadyReason(pending, resaves) {
  const named = pending.slice(0, 3).join(", ");
  const again = resaves > 0 ? ` after saving the metadata ${resaves + 1} times` : "";
  return `Getty does not show its "Ready to submit" icon for ${pending.length} file(s) (${named})${again} — the upload is not complete`;
}

/** One reading that also hands the panel its new counts; null when unreadable. */
async function readOnce(connection, sessionId, names, options) {
  const read = await readStateSafe(connection, sessionId, names);
  if (!read.ok) return null;
  options?.onState?.(read.state);
  return read.state;
}

/**
 * Re-fills the drawers that never took the metadata, then saves the grid again.
 * A card whose drawer could not be opened on the first pass (row not found yet,
 * editor locked) gets a real second chance here — re-saving alone cannot help a
 * file whose metadata was never typed.
 */
async function refillAndSave(connection, sessionId, options, pending) {
  const wanted = new Set(pending);
  const status = options.metadataStatus ?? new Map();
  const done = new Set();
  const refilled = [];
  for (const file of options.files ?? []) {
    const stem = stemOf(file.name);
    if (!file.metadata || !wanted.has(stem) || done.has(stem)) continue;
    if (status.get(file.name) === "saved") continue;
    done.add(stem);
    const filled = await fillOneFileMetadata(connection, sessionId, file, options);
    status.set(file.name, filled.status);
    refilled.push(filled);
  }
  if (refilled.length > 0) options.onRefilled?.(refilled);
  await saveEverySelected(connection, sessionId, options).catch(() => null);
}

/**
 * Waits until every contribution shows Getty's own "Ready to submit" icon, the
 * only proof that a file may be submitted. Rejected cards are left out (they can
 * never turn ready); every other open card is pursued — re-filled when its drawer
 * never took the metadata, then re-saved — and each card that turns ready buys
 * the run more time, so the last file gets a real chance. A page that cannot
 * report readiness at all is an error, never a pass.
 */
async function waitForReadyToSubmit(connection, sessionId, expected, options) {
  const plan = readyPlan(options, expected);
  const stems = [...new Set(expected.map(stemOf))];
  let deadline = Date.now() + plan.budget;
  let resaves = 0;
  let nextSaveAt = Date.now() + plan.retryMs;
  let best = 0;
  let state = await readOnce(connection, sessionId, expected, options);
  for (;;) {
    const readable = state !== null && state.cardsPresent !== false;
    const pending = readable ? notReadyContributions(expected, state) : stems;
    if (readable && pending.length === 0) {
      return { ok: true, verified: true, ready: plan.total, total: plan.total, notReady: [], resaves, state };
    }
    if (options.signal?.aborted) {
      return { ok: false, code: "cancelled", reason: "upload cancelled", notReady: pending, total: plan.total, resaves, state };
    }
    // Progress-driven window: every card that turned ready extends the deadline.
    if (plan.total - pending.length > best) {
      best = plan.total - pending.length;
      deadline = Math.min(plan.ceiling, Math.max(deadline, Date.now() + plan.budget));
    }
    if (Date.now() >= deadline) {
      return readable
        ? { ok: false, code: "timeout", reason: notReadyReason(pending, resaves), notReady: pending, total: plan.total, resaves, state }
        : { ok: false, code: "page", reason: NOT_READABLE, notReady: pending, total: plan.total, resaves, state };
    }
    if (resaves < plan.maxResaves && Date.now() >= nextSaveAt) {
      resaves += 1;
      nextSaveAt = Date.now() + plan.retryMs;
      options.onProgress?.(`${pending.length} file(s) are not ready to submit — filling and saving their metadata again (${resaves}/${plan.maxResaves})`);
      await refillAndSave(connection, sessionId, options, pending);
      state = (await readOnce(connection, sessionId, expected, options)) ?? state;
      continue;
    }
    await sleep(pollMsOf(options));
    state = (await readOnce(connection, sessionId, expected, options)) ?? state;
  }
}

/** The readiness part of a report: what Getty marked, and how often it was asked. */
function readinessReport(readiness) {
  return {
    ok: readiness.ok === true, verified: readiness.verified === true,
    ready: readiness.ready ?? 0, total: readiness.total ?? 0,
    notReady: readiness.notReady ?? [], resaves: readiness.resaves ?? 0,
    // The reading readiness ended on: it is the one that can show the icon.
    state: readiness.state ?? null,
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
  const readiness = await waitForReadyToSubmit(connection, sessionId, expected, options);
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
  options.onProgress?.("every file shows Ready to submit — Getty has no Complete button here, so this batch is finished");
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
    const readiness = await waitForReadyToSubmit(connection, sessionId, expected, options);
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
  const report = { metadata: filled.report, bulkSave: null, readiness: null, completion: null, state: null };
  if (filled.aborted) return { ok: false, code: "cancelled", reason: "upload cancelled", report };
  // The dates and text are in every drawer, so one save now covers all the files.
  if (anyDrawerSaved(filled.report)) report.bulkSave = await saveEverySelected(connection, sessionId, options);
  const names = namesOf((options.files ?? []).map((file) => file?.name));
  // Readiness runs for every card that is still open, rejected ones included: an
  // early return on a rejection is what left the last file never re-saved.
  const status = new Map(filled.report.map((entry) => [entry.name, entry.status]));
  const readiness = await waitForReadyToSubmit(connection, sessionId, names, {
    ...options, metadataStatus: status, onRefilled: (entries) => report.metadata.push(...entries),
  });
  report.readiness = readinessReport(readiness);
  if (!readiness.ok) return { ok: false, code: readiness.code ?? "timeout", reason: readiness.reason, report };
  const rejected = namesOf(options.failed);
  if (rejected.length > 0) {
    // Submitting a batch that still shows "Upload failed" cards locks those icons out.
    return {
      ok: false, code: "page", report,
      reason: `Getty reports "Upload failed" for ${rejected.length} file(s) (${rejected.slice(0, 3).join(", ")}) — the batch is not completed`,
    };
  }
  if (options.complete === false) return { ok: true, report };
  return finishValidated(connection, sessionId, options, report, readiness);
}
