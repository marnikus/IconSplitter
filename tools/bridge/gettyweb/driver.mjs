/* global document, location, window, Event, HTMLInputElement, HTMLTextAreaElement, MouseEvent */
// driver.mjs — page-side steps for the Getty Images / iStock contributor upload
// page (contribute.gettyimages.com). Every export here is a SELF-CONTAINED
// function: `cdp.mjs` serializes it with Function.prototype.toString() and
// evaluates it inside the real page, so it may only use its arguments and
// browser globals. The same functions run against a saved DOM in happy-dom
// tests (tests/getty_web_driver.test.ts), so selector knowledge stays honest.
//
// Selector sources: the captured "Batches" page markup (`data-cy` handles
// create-batch-button, create-batch-dialog, create-batch-submission-type,
// create-batch-confirm-button, submission_name, event_id). Nothing here fills
// or reads credentials beyond the current step's arguments.

export const CREATE_BATCH_DIALOG_SELECTOR = '[role="dialog"][aria-labelledby="create-batch-dialog"], [data-cy="create-batch-dialog"]';

const NON_TEXT_INPUTS = ["hidden", "checkbox", "radio", "submit", "button", "image", "file", "range", "color", "date", "time"];

/** Visible controls only: hidden mirrors and off-screen inputs must not win. */
function visible(el) {
  if (!el || el.disabled) return false;
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
  return true;
}

/**
 * Rendered, whether or not the control is enabled. Sign-in pages keep fields
 * disabled until their framework hydrates; those still accept a typed value,
 * so reading/filling uses this and only clicking uses `visible`.
 */
function shown(el) {
  if (!el) return false;
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
  return true;
}

/** React ignores a plain `.value =` write; use the native setter + events. */
function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (typeof desc?.set === "function") desc.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * AngularJS (the Getty ESP sign-in is `ng-app="SignInApp"`) only updates its
 * model from jQuery-style events on the wrapped element, so hand the value to
 * `angular.element(el)` as well — otherwise the form submits empty.
 */
function notifyAngular(el, value) {
  try {
    const ng = window.angular;
    if (!ng || typeof ng.element !== "function") return false;
    const wrapped = ng.element(el);
    if (typeof wrapped.val === "function" && wrapped.val() !== value) wrapped.val(value);
    for (const name of ["input", "change", "blur"]) {
      if (typeof wrapped.triggerHandler === "function") wrapped.triggerHandler(name);
    }
    return true;
  } catch {
    return false;
  }
}

/** Writes one value the way every framework on these pages observes it. */
function writeField(el, value) {
  if (el.isContentEditable) {
    el.focus?.();
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  setNativeValue(el, value);
  notifyAngular(el, value);
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

function textOf(el) {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function click(el) {
  el.scrollIntoView?.({ block: "center" });
  el.click();
  return true;
}

/** First visible element matching any selector in order. */
function firstVisible(selectors) {
  for (const selector of selectors) {
    const hit = [...document.querySelectorAll(selector)].find(visible);
    if (hit) return hit;
  }
  return null;
}

/**
 * Every field that can hold a value. The skip list is a module constant, so the
 * prelude must declare it too (`PAGE_PRELUDE` below) — otherwise the serialized
 * function arrives in the page as a bare `hidden,checkbox,…` expression and the
 * first step dies with "ReferenceError: hidden is not defined".
 */
function inputFields() {
  return [...document.querySelectorAll("input, [contenteditable=true]")]
    .filter(shown)
    .filter((el) => !NON_TEXT_INPUTS.includes(el.type ?? ""));
}

/**
 * The contribution a file belongs to: Getty lists a vector pair once, under one
 * of the two names (the EPS in the captured page), so files are matched by stem —
 * `icon-map-pin_5_01.jpg` and `icon-map-pin_5_01.eps` are the same contribution.
 */
function fileStem(name) {
  const leaf = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const dot = leaf.lastIndexOf(".");
  return (dot > 0 ? leaf.slice(0, dot) : leaf).trim().toLowerCase();
}

const CARD_NAME = '[data-cy="contribution-file-name"]';
const CARD_PROCESSING = '[data-cy="not-ready-icon"], [aria-label="not_ready_to_submit"]';
// The captured batch page shows "Upload failed" instead of a picture, and a
// successful contribution renders its thumbnail. That picture, not the arrival of
// the row, is the proof that Getty accepted the file.
const CARD_FAILED = /upload failed|failed to upload|upload error/i;
const CARD_THUMBNAIL = '[data-cy="image-thumbnail"], [data-cy="image-card"] img, img';

/** The contribution id Getty prints under a name (`ID: FSPID51446`). */
function cardIdOf(scope) {
  const match = /ID:\s*([A-Za-z0-9_-]{3,})/.exec(textOf(scope));
  return match ? match[1] : null;
}

/** A real picture in the card: a loaded/remote/embedded image, not a placeholder. */
function cardHasThumbnail(scope) {
  const img = scope.querySelector(CARD_THUMBNAIL);
  if (!img) return false;
  const src = String(img.currentSrc || img.getAttribute("src") || "");
  return img.naturalWidth > 0 || /^(https?:|data:|blob:)/.test(src);
}

/** One entry per contribution card the batch page lists, with what it shows. */
function uploadCards() {
  return [...document.querySelectorAll(CARD_NAME)].map((el) => {
    const name = textOf(el);
    const scope = el.closest('[data-cy="item-card"]') ?? el.closest('[data-cy="grid-row"]') ?? el.parentElement ?? el;
    return {
      name, stem: fileStem(name), id: cardIdOf(scope),
      processing: Boolean(scope.querySelector(CARD_PROCESSING)),
      failed: CARD_FAILED.test(textOf(scope)),
      thumbnail: cardHasThumbnail(scope),
      el, scope,
    };
  });
}

/**
 * How one file of this call stands right now: not on the page yet, failed on
 * Getty's side, uploaded (its card shows a picture) or still processing.
 */
function fileStatus(cards, name) {
  const card = cards.find((entry) => entry.stem === fileStem(name)) ?? null;
  if (!card) return "pending";
  if (card.failed) return "failed";
  return card.thumbnail ? "uploaded" : "processing";
}

/**
 * The identifier and password fields of whatever sign-in step is on screen.
 * Getty accepts an e-mail *or* the numeric contributor ID in the same box, so
 * the identifier is matched by name/hint and then by plain text type.
 */
function loginFields() {
  const inputs = inputFields();
  const password = inputs.find((el) => el.type === "password") ?? null;
  const candidates = inputs.filter((el) => el !== password);
  const named = candidates.find((el) => el.type === "email" || el.autocomplete === "username"
    || /email|user|login|account|member|contributor/i.test(`${el.name} ${el.id} ${el.placeholder ?? ""} ${labelTextOf(el)}`)) ?? null;
  const firstText = candidates.find((el) => ["text", "email", "tel", "number", ""].includes(el.type)) ?? null;
  return { identifier: named ?? (password === null ? null : firstText), password };
}

/** The control that sends a sign-in step, looked for inside its own form first. */
function submitControl() {
  const { identifier, password } = loginFields();
  const scope = password?.form ?? identifier?.form ?? document;
  const controls = [...scope.querySelectorAll("button, [type=submit], [role=button], a")].filter(visible);
  return controls.find((el) => el.type === "submit")
    ?? controls.find((el) => /^(sign ?in|log ?in|continue|next|submit|verify|confirm)$/i.test(textOf(el)))
    ?? null;
}

/** Everything that tells the sign-in state apart, without reading any value. */
function pageSignals() {
  const { identifier, password } = loginFields();
  const createButton = firstVisible(['[data-cy="create-batch-button"]']);
  const signInLink = [...document.querySelectorAll("a, button, [role=button]")]
    .filter((el) => !el.hidden && el.getAttribute("aria-hidden") !== "true")
    .find((el) => /^(sign ?in|log ?in)/i.test(textOf(el))) ?? null;
  const onContribute = /^\/contribute(\/|$)/.test(location.pathname) && !/log-?in|sign-?in|auth/i.test(location.href);
  return { identifier, password, createButton, signInLink, onContribute };
}

/**
 * Facts about the current contributor page. `signedIn` means the batches
 * surface rendered and no password field is asking to be filled.
 */
export function readPageInfo() {
  const { identifier, password, createButton, signInLink, onContribute } = pageSignals();
  const batchMatch = /\/contribute\/batches\/(\d+)/.exec(location.pathname);
  const bodyText = textOf(document.body).slice(0, 20000);
  return {
    url: location.href,
    path: location.pathname,
    title: document.title.slice(0, 120),
    signedIn: password === null && Boolean(createButton || (onContribute && !identifier && !signInLink)),
    loginForm: { email: Boolean(identifier), password: Boolean(password) },
    app: String(window.currentApplication ?? ""),
    challenge: /captcha|verify you are human|two-?factor|2fa|verification code|confirm your identity|unusual activity/i.test(`${document.title} ${bodyText}`),
    fields: inputFields().slice(0, 6).map((el) => ({
      type: el.type || "text", name: (el.name || el.id || "").slice(0, 40), hasValue: String(el.value ?? "") !== "",
    })),
    createBatch: Boolean(createButton),
    dialogOpen: Boolean(firstVisible([CREATE_BATCH_DIALOG_SELECTOR])),
    batchId: batchMatch ? batchMatch[1] : null,
    fileInputs: [...document.querySelectorAll('input[type="file"]')].map((el, index) => ({
      index, accept: el.getAttribute("accept") ?? "", multiple: el.multiple === true, visible: visible(el),
    })),
    batchRangeText: textOf(document.querySelector('[data-cy="submission-batch-range"]')),
  };
}

/**
 * Fills whatever login step is on screen. Getty may ask email first and the
 * password on the next screen, so the caller waits and calls again.
 */
export function fillLoginForm({ username, password }) {
  const { identifier, password: passwordField } = loginFields();
  if (!passwordField && !identifier) return { filled: false, stage: "none", submitted: false };
  if (identifier && username) writeField(identifier, username);
  if (passwordField && password) writeField(passwordField, password);
  const submit = submitControl();
  const submitted = submit === null ? false : click(submit);
  return { filled: true, stage: passwordField ? "password" : "email", submitted };
}

/**
 * Focuses (and clears) one sign-in field so the helper can type into it with
 * real key events — the most reliable way to reach Angular/React models.
 */
export function focusLoginField({ which }) {
  const { identifier, password } = loginFields();
  const el = which === "password" ? password : identifier;
  if (!el) return { focused: false, type: null };
  el.focus?.();
  if (el.isContentEditable) el.textContent = "";
  else setNativeValue(el, "");
  el.focus?.();
  return { focused: document.activeElement === el, type: el.type || "text" };
}

/** What the sign-in screen actually offers, as short strings — never values. */
export function inspectSignIn() {
  const inputs = inputFields();
  const buttons = [...document.querySelectorAll("button, [role=button], [type=submit]")].filter(shown)
    .map((el) => textOf(el) || el.getAttribute("aria-label") || "").filter((label) => label !== "");
  const sources = [...document.querySelectorAll("iframe, script")].map((el) => el.getAttribute("src") ?? "");
  const fraudFlag = window.experiences?.frauddetectionprovidersigninarkose?.is_active === true;
  return {
    app: String(window.currentApplication ?? ""),
    title: document.title.slice(0, 80),
    angular: Boolean(window.angular),
    inputs: inputs.slice(0, 8).map((el) => `${el.type || "text"}#${(el.name || el.id || "?").slice(0, 24)}`
      + `${el.disabled ? "(disabled)" : ""}`),
    buttons: [...new Set(buttons)].slice(0, 8),
    forms: document.querySelectorAll("form").length,
    arkose: fraudFlag || sources.some((src) => /arkose|funcaptcha|verify\.gettyimages/i.test(src)),
  };
}

/** Clicks the "sign in with e-mail/password" option when Getty opens elsewhere. */
export function choosePasswordOption() {
  const controls = [...document.querySelectorAll("button, a, [role=button], [role=tab]")].filter(visible);
  const control = controls.find((el) => /password/i.test(textOf(el)))
    ?? controls.find((el) => /^(use|continue with|sign in|log in)\b/i.test(textOf(el)) && !/google|apple|facebook/i.test(textOf(el)))
    ?? null;
  if (!control) return { chosen: false, label: null };
  click(control);
  return { chosen: true, label: textOf(control) };
}

/** Presses sign-in again: the button when there is one, else Enter/the form. */
export function submitLogin() {
  const control = submitControl();
  if (control !== null) {
    click(control);
    return { submitted: true, method: "click", label: textOf(control) };
  }
  const { identifier, password } = loginFields();
  const field = password ?? identifier;
  if (field === null) return { submitted: false, method: "none", label: null };
  field.focus?.();
  for (const type of ["keydown", "keypress", "keyup"]) {
    field.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
  }
  const form = field.form ?? field.closest("form");
  if (form === null) return { submitted: true, method: "keyboard", label: null };
  try {
    form.requestSubmit();
  } catch {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
  return { submitted: true, method: "form", label: null };
}

/** Clicks "Create Batch" on the batches page. */
export function openCreateBatchDialog() {
  if (firstVisible([CREATE_BATCH_DIALOG_SELECTOR])) return { clicked: true, reason: null };
  const button = firstVisible(['[data-cy="create-batch-button"]']);
  if (!button) return { clicked: false, reason: "Create Batch button not found" };
  click(button);
  return { clicked: true, reason: null };
}

/** Opens the submission-type menu (Material UI listbox renders in a portal). */
export function openSubmissionTypeMenu({ label } = {}) {
  const control = firstVisible([
    '[data-cy="create-batch-submission-type"] [role=combobox]',
    '[data-cy="create-batch-submission-type"]',
  ]);
  if (!control) return { opened: false, options: [] };
  const wanted = String(label ?? "").trim().toLowerCase();
  if (wanted && textOf(control).toLowerCase() === wanted) return { opened: true, selected: true, options: [] };
  // MUI Select opens on mousedown, not click. Its listbox mounts in a portal.
  control.scrollIntoView?.({ block: "center" });
  control.focus?.();
  control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  const options = [...document.querySelectorAll('[role="option"]')].map(textOf);
  return { opened: true, options };
}

/** Picks one visible listbox option by its label. */
export function chooseSubmissionTypeOption({ label }) {
  const wanted = String(label ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const option = [...document.querySelectorAll('[role="option"]')]
    .find((el) => visible(el) && textOf(el).toLowerCase() === wanted);
  if (!option) {
    const seen = [...document.querySelectorAll('[role="option"]')].map(textOf);
    return { chosen: false, reason: `submission type "${label}" is not offered`, options: seen };
  }
  click(option);
  return { chosen: true, reason: null, options: [] };
}

/** Fills the Create Batch dialog's name and optional brief code. */
export function fillBatchDetails({ batchName, briefCode }) {
  const name = document.querySelector('input[name="submission_name"]');
  const brief = document.querySelector('input[name="event_id"]');
  if (!name) return { filled: false, reason: "Batch name field not found" };
  if (batchName) setNativeValue(name, batchName);
  if (brief && briefCode) setNativeValue(brief, briefCode);
  return { filled: true, reason: null };
}

/** Submits the Create Batch dialog. */
export function submitBatchCreation() {
  const confirm = firstVisible(['[data-cy="create-batch-confirm-button"]']);
  if (!confirm) return { clicked: false, reason: "Create button not found" };
  click(confirm);
  return { clicked: true, reason: null };
}

/**
 * What the batch page shows for the files just handed to it. A contribution
 * counts as uploaded the moment its card is listed, even while Getty is still
 * processing it (`processing`), because the bytes are already on Getty's side.
 */
export function readUploadState({ names }) {
  const body = textOf(document.body).slice(0, 200000);
  const wanted = Array.isArray(names) ? names.filter((n) => typeof n === "string" && n !== "") : [];
  const cards = uploadCards();
  const lower = body.toLowerCase();
  // A page without cards (older layout) has no thumbnail to check: a name in the
  // text is all the proof there is, so it keeps the old "listed means uploaded".
  const statusOf = (name) => (cards.length > 0
    ? fileStatus(cards, name)
    : (fileStem(name) !== "" && lower.includes(fileStem(name)) ? "uploaded" : "pending"));
  const listed = (name) => statusOf(name) !== "pending";
  const byStatus = (status) => wanted.filter((name) => statusOf(name) === status);
  const count = (re) => Number((re.exec(body) ?? [])[1] ?? 0);
  return {
    url: location.href,
    namesSeen: wanted.filter(listed),
    missing: wanted.filter((name) => !listed(name)),
    /** Names whose card shows a picture: Getty took them, and the app may say so. */
    uploaded: byStatus("uploaded"),
    /** Names Getty answered with "Upload failed" — never counted as uploaded. */
    failed: byStatus("failed"),
    /** Listed, no picture yet: recognition or the thumbnail is still coming. */
    processingNames: byStatus("processing"),
    failures: cards.filter((card) => card.failed).map((card) => ({ name: card.name, id: card.id })).slice(0, 50),
    contributions: cards.map((card) => card.name).slice(0, 50),
    fileCount: cards.length,
    processing: cards.some((card) => card.processing),
    // A page without cards says nothing about processing, so it is not waited on.
    ready: !cards.some((card) => card.processing),
    chips: {
      accepted: count(/(\d+)\s+Accepted\b/i),
      rejected: count(/(\d+)\s+Rejected\b/i),
      needsRevision: count(/(\d+)\s+Needs revision\b/i),
      inReview: count(/(\d+)\s+In review\b/i),
      notSubmitted: count(/(\d+)\s+Not submitted\b/i),
    },
    signInRequired: Boolean(firstVisible(["input[type=password]"])),
    text: body.slice(0, 400),
  };
}

/** Everything a form field is labelled by: name/id/placeholder/aria/label text. */
function labelTextOf(el) {
  const parts = [el.getAttribute("name"), el.id, el.getAttribute("placeholder"), el.getAttribute("aria-label")];
  if (el.labels && el.labels[0]) parts.push(el.labels[0].textContent);
  const wrapping = el.closest("label");
  if (wrapping) parts.push(wrapping.textContent);
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** Writes a value the way React/MUI observes it, then commits chip-style keys. */
function setFieldValue(el, value) {
  if (el.isContentEditable) {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  setNativeValue(el, value);
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
}

/**
 * Types title/description/keywords into whatever metadata editor is open.
 * `overwrite: false` keeps values Getty already prefilled from the file's
 * embedded XMP/IPTC, so an upload never silently rewrites accepted text.
 */
export function fillMetadataFields({ title, description, keywords, dateCreated, overwrite }) {
  const fields = [...document.querySelectorAll("input, textarea, [contenteditable=true]")].filter(visible);
  const find = (pattern) => fields.find((el) => pattern.test(labelTextOf(el))) ?? null;
  const targets = {
    title: find(/title|headline/i),
    description: find(/description|caption/i),
    keywords: find(/keyword|\btags?\b/i),
    dateCreated: find(/date created|created date|created_date|creation date/i),
  };
  const filled = { title: false, description: false, keywords: false };
  const present = {
    title: targets.title !== null, description: targets.description !== null, keywords: targets.keywords !== null,
  };
  if (targets.dateCreated) present.dateCreated = true;
  for (const [key, el] of Object.entries(targets)) {
    if (!el) continue;
    const current = el.isContentEditable ? (el.textContent ?? "") : String(el.value ?? "");
    if (!overwrite && current.trim() !== "") continue;
    const value = key === "keywords" ? (Array.isArray(keywords) ? keywords.join(", ") : "")
      : (key === "title" ? title : key === "dateCreated" ? dateCreated : description);
    if (typeof value !== "string" || value.trim() === "") continue;
    setFieldValue(el, value);
    filled[key] = true;
  }
  return { filled, present };
}

/** Opens the metadata editor for one uploaded file (row button, else the row). */
export function openFileMetadata({ fileName }) {
  const stem = fileStem(fileName);
  if (stem === "") return { opened: false, method: "none", label: null };
  // A batch card is selected by clicking it; the drawer enables only then.
  const card = uploadCards().find((entry) => entry.stem === stem) ?? null;
  if (card) {
    click(card.scope.querySelector('[data-cy="image-card"]') ?? card.el);
    return { opened: true, method: "card", label: card.name };
  }
  const matches = [...document.querySelectorAll("a, span, p, td, div")]
    .filter((el) => visible(el) && fileStem(textOf(el)) === stem);
  const node = matches[matches.length - 1];
  if (!node) return { opened: false, method: "none", label: null };
  const row = node.closest("tr, li, [role=row], [data-testid*=row], section, article") ?? node.parentElement ?? node;
  const control = [...row.querySelectorAll("button, a, [role=button]")].find((el) => visible(el)
    && /edit|metadata|details|keyword|info/i.test(`${textOf(el)} ${el.getAttribute("aria-label") ?? ""}`));
  if (control) {
    click(control);
    return { opened: true, method: "button", label: textOf(control) };
  }
  click(node);
  return { opened: true, method: "row", label: null };
}

/** Saves the open metadata editor (Save / Save and close / Apply / Done). */
export function saveMetadataEditor() {
  const buttons = [...document.querySelectorAll("button, [role=button]")].filter(visible);
  const save = buttons.find((el) => /^(save|save & close|save and close|save changes|apply|done|update)$/i.test(textOf(el))
    || /^save/i.test(el.getAttribute("aria-label") ?? ""));
  if (!save) return { saved: false, label: null };
  click(save);
  return { saved: true, label: textOf(save) };
}

/** Leaves a metadata editor that is still open (Close / Back / Cancel). */
export function closeMetadataEditor() {
  const dialogs = [...document.querySelectorAll("[role=dialog], [role=alertdialog]")].filter(visible);
  const scope = dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
  if (!scope) return { closed: false, label: null };
  const buttons = [...scope.querySelectorAll("button, [role=button]")].filter(visible);
  const closer = buttons.find((el) => /^(close|back|cancel|done)$/i.test(textOf(el)));
  if (!closer) return { closed: false, label: null };
  click(closer);
  return { closed: true, label: textOf(closer) };
}

/**
 * Closes anything Getty left on screen that would block the next icon: an error
 * snackbar from a failed field-restrictions load, a stale dialog. Never touches a
 * dialog that has no dismiss control (the run must not guess).
 */
export function dismissPageDialogs() {
  const scopes = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=alert], [data-cy$="-error"]')]
    .filter(visible);
  const closed = [];
  for (const scope of scopes) {
    const control = [...scope.querySelectorAll("button, [role=button]")].filter(visible)
      .find((el) => /^(dismiss|cancel|close|ok|got it|no thanks)$/i.test(textOf(el)));
    if (!control) continue;
    click(control);
    closed.push(textOf(control));
  }
  return { dismissed: closed.length, labels: closed };
}

/** Clicks the batch's Complete / Submit control. */
export function completeBatch() {
  const buttons = [...document.querySelectorAll("button, a, [role=button]")].filter(visible);
  const target = buttons.find((el) => /^(complete|complete batch|submit|submit batch|submit for review|send for review|finish)$/i.test(textOf(el)));
  if (!target) return { clicked: false, label: null };
  click(target);
  return { clicked: true, label: textOf(target) };
}

/** Accepts a confirmation dialog raised by Complete/Submit, when there is one. */
export function confirmCompletion() {
  const dialogs = [...document.querySelectorAll("[role=dialog], [role=alertdialog]")].filter(visible);
  const scope = dialogs.length > 0 ? dialogs[dialogs.length - 1] : null;
  if (!scope) return { confirmed: false, label: null, dialog: false };
  const buttons = [...scope.querySelectorAll("button, [role=button]")].filter(visible);
  const confirm = buttons.find((el) => /^(submit|submit batch|submit for review|complete|complete batch|confirm|yes|send|ok)$/i.test(textOf(el)));
  if (!confirm) return { confirmed: false, label: null, dialog: true };
  click(confirm);
  return { confirmed: true, label: textOf(confirm), dialog: true };
}

/** The batch page's current completion affordances and status text. */
export function readCompletionState() {
  const text = textOf(document.body).slice(0, 200000);
  const buttons = [...document.querySelectorAll("button, a, [role=button]")].filter(visible).map(textOf).filter((t) => t !== "");
  return {
    url: location.href,
    buttons: buttons.slice(0, 40),
    canComplete: buttons.some((label) => /^(complete|submit|submit batch|finish)$/i.test(label)),
    submitted: /batch (submitted|completed)|submitted for review/i.test(text),
    chips: {
      accepted: Number((/(\d+)\s+Accepted\b/i.exec(text) ?? [])[1] ?? 0),
      inReview: Number((/(\d+)\s+In review\b/i.exec(text) ?? [])[1] ?? 0),
      notSubmitted: Number((/(\d+)\s+Not submitted\b/i.exec(text) ?? [])[1] ?? 0),
    },
  };
}

/**
 * The helper sources above, injected ahead of every evaluated step so a
 * serialized function finds `visible`, `firstVisible`, … in the page scope.
 */
export const PAGE_PRELUDE = [
  visible, shown, setNativeValue, notifyAngular, writeField, textOf, click, firstVisible,
  fileStem, uploadCards, cardIdOf, cardHasThumbnail, fileStatus, inputFields, loginFields,
  submitControl, pageSignals, labelTextOf, setFieldValue,
]
  .map((fn) => fn.toString()).join("\n")
  + `\nconst NON_TEXT_INPUTS = ${JSON.stringify(NON_TEXT_INPUTS)};`
  + `\nconst CREATE_BATCH_DIALOG_SELECTOR = ${JSON.stringify(CREATE_BATCH_DIALOG_SELECTOR)};`
  + `\nconst CARD_NAME = ${JSON.stringify(CARD_NAME)};`
  + `\nconst CARD_PROCESSING = ${JSON.stringify(CARD_PROCESSING)};`
  + `\nconst CARD_FAILED = ${CARD_FAILED.toString()};`
  + `\nconst CARD_THUMBNAIL = ${JSON.stringify(CARD_THUMBNAIL)};`;

/** Names of every driver step the bridge may call, for a clear error message. */
export const DRIVER_STEPS = [
  "readPageInfo", "fillLoginForm", "focusLoginField", "inspectSignIn", "choosePasswordOption", "submitLogin",
  "openCreateBatchDialog", "openSubmissionTypeMenu",
  "chooseSubmissionTypeOption", "fillBatchDetails", "submitBatchCreation", "readUploadState",
  "fillMetadataFields", "openFileMetadata", "saveMetadataEditor", "closeMetadataEditor",
  "dismissPageDialogs", "completeBatch", "confirmCompletion", "readCompletionState",
];
