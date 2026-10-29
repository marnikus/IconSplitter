/* global document, location, Event, HTMLInputElement, HTMLTextAreaElement */
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

/** Visible controls only: hidden mirrors and off-screen inputs must not win. */
function visible(el) {
  if (!el || el.disabled) return false;
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

/** The sign-in fields on screen, matched without CSS case-insensitive flags. */
function loginFields() {
  const inputs = [...document.querySelectorAll("input")].filter(visible);
  const password = inputs.find((el) => el.type === "password") ?? null;
  const email = inputs.find((el) => el.type === "email" || el.autocomplete === "username"
    || /email|user|login/i.test(`${el.name} ${el.id} ${el.placeholder}`)) ?? null;
  return { email, password };
}

/**
 * Facts about the current contributor page. `signedIn` means the batches
 * surface rendered and no password field is asking to be filled.
 */
export function readPageInfo() {
  const { email, password } = loginFields();
  const createButton = firstVisible(['[data-cy="create-batch-button"]']);
  const batchMatch = /\/contribute\/batches\/(\d+)/.exec(location.pathname);
  return {
    url: location.href,
    path: location.pathname,
    signedIn: Boolean(createButton) && !password,
    loginForm: { email: Boolean(email), password: Boolean(password) },
    createBatch: Boolean(createButton),
    dialogOpen: Boolean(document.querySelector('[data-cy="create-batch-dialog"]')),
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
  const { email: emailField, password: passwordField } = loginFields();
  if (!passwordField && !emailField) return { filled: false, stage: "none", submitted: false };
  if (emailField && username) setNativeValue(emailField, username);
  if (passwordField && password) setNativeValue(passwordField, password);
  const submit = firstVisible([
    'button[type=submit]', "form button", '[data-cy="login-submit"]', '[data-testid="submit"]',
  ]);
  const submitted = submit ? click(submit) : false;
  return { filled: true, stage: passwordField ? "password" : "email", submitted };
}

/** Clicks "Create Batch" on the batches page. */
export function openCreateBatchDialog() {
  const button = firstVisible(['[data-cy="create-batch-button"]']);
  if (!button) return { clicked: false, reason: "Create Batch button not found" };
  click(button);
  return { clicked: true, reason: null };
}

/** Opens the submission-type menu (Material UI listbox renders in a portal). */
export function openSubmissionTypeMenu() {
  const control = firstVisible([
    '[data-cy="create-batch-submission-type"] [role=combobox]',
    '[data-cy="create-batch-submission-type"]',
  ]);
  if (!control) return { opened: false, options: [] };
  click(control);
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

/** Best-effort read of the batch page's per-file pipeline counters. */
export function readUploadState({ names }) {
  const body = textOf(document.body).slice(0, 200000);
  const wanted = Array.isArray(names) ? names.filter((n) => typeof n === "string" && n !== "") : [];
  const count = (re) => Number((re.exec(body) ?? [])[1] ?? 0);
  return {
    url: location.href,
    namesSeen: wanted.filter((name) => body.includes(name)),
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
export function fillMetadataFields({ title, description, keywords, overwrite }) {
  const fields = [...document.querySelectorAll("input, textarea, [contenteditable=true]")].filter(visible);
  const find = (pattern) => fields.find((el) => pattern.test(labelTextOf(el))) ?? null;
  const targets = {
    title: find(/title|headline/i),
    description: find(/description|caption/i),
    keywords: find(/keyword|\btags?\b/i),
  };
  const filled = {};
  for (const [key, el] of Object.entries(targets)) {
    filled[key] = false;
    if (!el) continue;
    const current = el.isContentEditable ? (el.textContent ?? "") : String(el.value ?? "");
    if (!overwrite && current.trim() !== "") continue;
    const value = key === "keywords" ? (Array.isArray(keywords) ? keywords.join(", ") : "") : (key === "title" ? title : description);
    if (typeof value !== "string" || value.trim() === "") continue;
    setFieldValue(el, value);
    filled[key] = true;
  }
  return {
    filled,
    present: Object.fromEntries(Object.entries(targets).map(([key, el]) => [key, el !== null])),
  };
}

/** Opens the metadata editor for one uploaded file (row button, else the row). */
export function openFileMetadata({ fileName }) {
  const needle = String(fileName ?? "").trim().toLowerCase();
  if (needle === "") return { opened: false, method: "none", label: null };
  const matches = [...document.querySelectorAll("a, span, p, td, div")]
    .filter((el) => visible(el) && textOf(el).toLowerCase() === needle);
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
  visible, setNativeValue, textOf, click, firstVisible, loginFields, labelTextOf, setFieldValue,
]
  .map((fn) => fn.toString()).join("\n");

/** Names of every driver step the bridge may call, for a clear error message. */
export const DRIVER_STEPS = [
  "readPageInfo", "fillLoginForm", "openCreateBatchDialog", "openSubmissionTypeMenu",
  "chooseSubmissionTypeOption", "fillBatchDetails", "submitBatchCreation", "readUploadState",
  "fillMetadataFields", "openFileMetadata", "saveMetadataEditor", "closeMetadataEditor",
  "completeBatch", "confirmCompletion", "readCompletionState",
];
