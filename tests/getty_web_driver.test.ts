// The Getty web upload's page steps are real functions that the bridge
// serializes into the contributor page. Here they run against markup shaped
// like the captured Batches page + Create Batch dialog, so selector and
// React-friendly-fill behaviour is proven without a browser or a live account.

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as driver from "../tools/bridge/gettyweb/driver.mjs";

const BATCHES_PAGE = `
  <main>
    <button data-cy="create-batch-button">Create Batch</button>
    <p data-cy="submission-batch-range">Showing 1 to 1 of 1 batches</p>
    <p>144 Accepted 0 Rejected 0 Needs revision 2 In review 7 Not submitted</p>
    <p>icon_a.jpg · In review</p>
    <p>Submission date: 2026-10-25</p>
  </main>`;

const LOGIN_PAGE = `
  <form id="login">
    <input type="email" name="email" />
    <input type="password" name="password" />
    <button type="submit">Sign in</button>
  </form>`;

const DIALOG_PAGE = `${BATCHES_PAGE}
  <div data-cy="create-batch-dialog">
    <div data-cy="create-batch-submission-type">
      <div role="combobox" aria-expanded="false">iStock creative illustration</div>
    </div>
    <input name="event_id" />
    <input name="submission_name" />
    <button data-cy="create-batch-cancel-button">Cancel</button>
    <button data-cy="create-batch-confirm-button">Create</button>
  </div>`;

// The captured batch detail page: a vector pair is listed once, by its EPS name,
// and the JPEG only ever appears as the "Raster file" row of the metadata drawer.
const CARD_PAGE = `
  <header><h6 data-cy="batch-detail-header">2026-10-29 (2 icons)</h6></header>
  <button data-cy="open-upload-dialog-button">Upload</button>
  <p>1 file</p>
  <div data-cy="grid-row"><div>
    <div data-cy="item-card">
      <div data-cy="image-card"><img data-cy="image-thumbnail" alt="Location pinpointing"></div>
      <div data-cy="item-info">
        <svg data-cy="not-ready-icon" aria-label="not_ready_to_submit"></svg>
        <p data-cy="contribution-file-name">icon-map-pin_5_01.eps</p>
        <p data-cy="contribution-id-514493389">ID: 2302596512</p>
      </div>
    </div>
  </div></div>
  <div data-cy="metadata-drawer">
    <form data-cy="metadata-form">
      <div data-cy="md-headline"><textarea name="headline" disabled></textarea></div>
      <div data-cy="md-caption"><textarea name="caption" disabled></textarea></div>
      <div data-cy="md-created_date"><textarea name="created_date" disabled></textarea></div>
      <div data-cy="metadata-keyword-multiselect">
        <textarea id="keywords" placeholder="Add keywords, separated by commas" disabled></textarea>
      </div>
      <button data-cy="save-metadata" disabled>Save metadata</button>
    </form>
  </div>`;

function mount(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/contribute/batches");
  mount(BATCHES_PAGE);
});

describe("Getty contributor page steps", () => {
  it("recognises the signed-in Batches page and reads the pipeline counters", () => {
    const info = driver.readPageInfo();
    expect(info.signedIn).toBe(true);
    expect(info.createBatch).toBe(true);
    expect(info.loginForm).toEqual({ email: false, password: false });

    const state = driver.readUploadState({ names: ["icon_a.jpg", "missing.eps"] });
    expect(state.namesSeen).toEqual(["icon_a.jpg"]);
    expect(state.chips).toMatchObject({ accepted: 144, rejected: 0, needsRevision: 0, inReview: 2, notSubmitted: 7 });
    expect(state.signInRequired).toBe(false);
  });

  it("reports the batch id from the batch page URL", () => {
    window.history.replaceState({}, "", "/contribute/batches/68445204");
    expect(driver.readPageInfo().batchId).toBe("68445204");
  });

  it("detects a sign-in screen and fills both fields through the React value setter", () => {
    mount(LOGIN_PAGE);
    window.history.replaceState({}, "", "/login");
    const info = driver.readPageInfo();
    expect(info.signedIn).toBe(false);
    expect(info.loginForm).toEqual({ email: true, password: true });

    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    document.querySelector("form")!.addEventListener("submit", onSubmit);
    const result = driver.fillLoginForm({ username: "someone@example.com", password: "NotInTheLog!42" });
    expect(result).toEqual({ filled: true, stage: "password", submitted: true });
    expect(document.querySelector<HTMLInputElement>('input[name="email"]')!.value).toBe("someone@example.com");
    expect(document.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe("NotInTheLog!42");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("fills only the password when Getty asks for it on a second screen", () => {
    mount('<form><input type="password" name="password" /><button type="submit">Continue</button></form>');
    const result = driver.fillLoginForm({ username: "someone@example.com", password: "SecondScreen!9" });
    expect(result.stage).toBe("password");
    expect(document.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe("SecondScreen!9");
  });

  it("signs in with the numeric contributor ID when that is the identifier on the page", () => {
    mount(`
      <form id="login">
        <label>E-mail or contributor ID <input type="text" name="username" /></label>
        <input type="password" name="password" />
        <button type="submit">Sign in</button>
      </form>`);
    window.history.replaceState({}, "", "/log-in");
    expect(driver.readPageInfo().loginForm).toEqual({ email: true, password: true });
    const result = driver.fillLoginForm({ username: "1234567", password: "ContributorId!42" });
    expect(result).toEqual({ filled: true, stage: "password", submitted: true });
    expect(document.querySelector<HTMLInputElement>('input[name="username"]')!.value).toBe("1234567");
    expect(document.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe("ContributorId!42");
  });

  it("reports what a stalled sign-in page shows without exposing typed values", () => {
    mount(`
      <form>
        <input type="text" name="username" value="1234567" />
        <input type="password" name="password" value="SavedPassword!1" />
        <p>Verify you are human</p>
        <button type="button">Sign in with Google</button>
        <button type="button">Sign in with password</button>
      </form>`);
    const info = driver.readPageInfo();
    expect(info.challenge).toBe(true);
    expect(info.fields.map((f: { type: string; hasValue: boolean }) => [f.type, f.hasValue]))
      .toEqual([["text", true], ["password", true]]);
    expect(JSON.stringify(info)).not.toContain("1234567");
    expect(JSON.stringify(info)).not.toContain("SavedPassword!1");
  });

  it("chooses the password option when the page opens on another sign-in method", () => {
    mount(`
      <div role="dialog">
        <button type="button">Sign in with Google</button>
        <button type="button">Sign in with password</button>
      </div>`);
    const chosen = vi.fn();
    [...document.querySelectorAll("button")][1]!.addEventListener("click", chosen);
    expect(driver.choosePasswordOption()).toEqual({ chosen: true, label: "Sign in with password" });
    expect(chosen).toHaveBeenCalledTimes(1);
    expect(driver.readPageInfo().loginForm).toEqual({ email: false, password: false });
  });

  it("presses a Continue control that is not a form submit button", () => {
    mount(`
      <form>
        <input type="text" name="username" />
        <button type="button" data-cy="signin-continue">Continue</button>
      </form>`);
    const pressed = vi.fn();
    document.querySelector("button")!.addEventListener("click", pressed);
    expect(driver.fillLoginForm({ username: "1234567", password: "ContributorId!42" }))
      .toEqual({ filled: true, stage: "email", submitted: true });
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it("falls back to Enter and the form's own submit when no control is on screen", () => {
    mount('<form><input type="password" name="password" /></form>');
    const submitted = vi.fn((event: Event) => event.preventDefault());
    document.querySelector("form")!.addEventListener("submit", submitted);
    expect(driver.fillLoginForm({ username: "1234567", password: "ContributorId!42" }).submitted).toBe(false);
    expect(driver.submitLogin()).toMatchObject({ submitted: true });
    expect(submitted).toHaveBeenCalledTimes(1);
  });

  it("treats a /contribute page as signed in unless it still asks to sign in", () => {
    window.history.replaceState({}, "", "/contribute/batches");
    mount('<main><p>Loading your batches…</p></main>');
    expect(driver.readPageInfo().signedIn).toBe(true);

    mount('<main><a href="/log-in">Sign in</a></main>');
    expect(driver.readPageInfo().signedIn).toBe(false);
  });

  it("writes through angular.element so an ng-model form is never submitted empty", () => {
    const calls: string[] = [];
    (window as unknown as { angular: unknown }).angular = {
      element: () => ({
        val(value?: string) { if (value !== undefined) calls.push(`val:${value}`); return ""; },
        triggerHandler(name: string) { calls.push(`on:${name}`); },
      }),
    };
    try {
      mount('<form><input type="text" name="username" /><input type="password" name="password" /><button type="submit">Sign in</button></form>');
      driver.fillLoginForm({ username: "1234567", password: "ContributorId!42" });
      expect(calls).toContain("val:1234567");
      expect(calls).toContain("val:ContributorId!42");
      expect(calls).toContain("on:input");
    } finally {
      delete (window as unknown as { angular?: unknown }).angular;
    }
  });

  it("still fills fields its framework keeps disabled until hydration", () => {
    mount(`
      <form>
        <input type="text" name="username" disabled />
        <input type="password" name="password" disabled />
      </form>`);
    expect(driver.readPageInfo().loginForm).toEqual({ email: true, password: true });
    expect(driver.fillLoginForm({ username: "1234567", password: "ContributorId!42" }).filled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('input[name="username"]')!.value).toBe("1234567");
    expect(document.querySelector<HTMLInputElement>('input[name="password"]')!.value).toBe("ContributorId!42");
  });

  it("focuses and clears one field so real keystrokes land in it", () => {
    mount('<form><input type="text" name="username" value="stale@example.com" /></form>');
    const focused = driver.focusLoginField({ which: "identifier" });
    expect(focused).toEqual({ focused: true, type: "text" });
    expect(document.querySelector<HTMLInputElement>('input[name="username"]')!.value).toBe("");
    expect(driver.focusLoginField({ which: "password" })).toEqual({ focused: false, type: null });
  });

  it("describes a sign-in screen it is stuck on without reading any value", () => {
    mount(`
      <div ng-app="SignInApp">
        <input type="text" name="username" value="1234567" />
        <input type="password" name="password" value="SavedPassword!1" />
        <button type="button">Sign in</button>
      </div>`);
    (window as unknown as { currentApplication?: string }).currentApplication = "sign-in";
    (window as unknown as { experiences?: unknown }).experiences = {
      frauddetectionprovidersigninarkose: { is_active: true },
    };
    try {
      const report = driver.inspectSignIn();
      expect(report).toMatchObject({ app: "sign-in", forms: 0, arkose: true, angular: false });
      expect(report.inputs).toEqual(["text#username", "password#password"]);
      expect(report.buttons).toEqual(["Sign in"]);
      expect(JSON.stringify(report)).not.toContain("1234567");
      expect(JSON.stringify(report)).not.toContain("SavedPassword!1");
      // The fraud script is on every sign-in page, so it is context, not proof:
      // only real captcha wording turns the failure into an interactive check.
      expect(driver.readPageInfo().challenge).toBe(false);
    } finally {
      delete (window as unknown as { currentApplication?: string }).currentApplication;
      delete (window as unknown as { experiences?: unknown }).experiences;
    }
  });

  it("opens the Create Batch dialog, fills it, and submits", () => {
    mount(DIALOG_PAGE);
    const create = document.querySelector<HTMLButtonElement>('[data-cy="create-batch-button"]')!;
    const clicked = vi.fn();
    create.addEventListener("click", clicked);

    expect(driver.openCreateBatchDialog()).toEqual({ clicked: true, reason: null });
    expect(clicked).not.toHaveBeenCalled(); // the dialog is already open
    expect(driver.readPageInfo().dialogOpen).toBe(true);

    expect(driver.fillBatchDetails({ batchName: "2026-10-29 (3 icons)" })).toEqual({ filled: true, reason: null });
    expect(document.querySelector<HTMLInputElement>('input[name="submission_name"]')!.value)
      .toBe("2026-10-29 (3 icons)");

    const confirm = vi.fn();
    document.querySelector('[data-cy="create-batch-confirm-button"]')!.addEventListener("click", confirm);
    expect(driver.submitBatchCreation()).toEqual({ clicked: true, reason: null });
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("chooses the submission type by label and lists the offered options when absent", () => {
    mount(`${BATCHES_PAGE}
      <ul role="listbox">
        <li role="option">iStock creative illustration</li>
        <li role="option">iStock creative image</li>
      </ul>`);
    expect(driver.chooseSubmissionTypeOption({ label: "iStock creative image" }))
      .toMatchObject({ chosen: true, reason: null });

    const missing = driver.chooseSubmissionTypeOption({ label: "iStock creative video" });
    expect(missing.chosen).toBe(false);
    expect(missing.options).toEqual(["iStock creative illustration", "iStock creative image"]);
  });

  it("reports a missing Create Batch button instead of pretending it clicked", () => {
    mount("<main>Sign-in required</main>");
    expect(driver.openCreateBatchDialog()).toEqual({ clicked: false, reason: "Create Batch button not found" });
    expect(driver.submitBatchCreation()).toEqual({ clicked: false, reason: "Create button not found" });
  });

  it("fills title, description and keywords only where the editor is still empty", () => {
    mount(`
      <div role="dialog">
        <label>Title <input name="title" value="" /></label>
        <label>Description <textarea name="description"></textarea></label>
        <label>Keywords <input name="keywords" value="" /></label>
        <button>Save</button>
      </div>`);
    const title = document.querySelector<HTMLInputElement>('input[name="title"]')!;
    const description = document.querySelector<HTMLTextAreaElement>("textarea")!;
    const keywords = document.querySelector<HTMLInputElement>('input[name="keywords"]')!;
    const result = driver.fillMetadataFields({
      title: "Charity hand icon", description: "Open palm holding a heart.", keywords: ["charity", "care", "heart"], overwrite: false,
    });
    expect(result).toMatchObject({
      filled: { title: true, description: true, keywords: true },
      present: { title: true, description: true, keywords: true },
    });
    expect(title.value).toBe("Charity hand icon");
    expect(description.value).toBe("Open palm holding a heart.");
    expect(keywords.value).toBe("charity, care, heart");
  });

  it("never overwrites values Getty prefilled from embedded metadata", () => {
    mount('<label>Title <input name="title" value="Prefilled from XMP" /></label><label>Keywords <input name="keywords" value="a, b" /></label>');
    const result = driver.fillMetadataFields({ title: "New title", description: "d", keywords: ["c"], overwrite: false });
    expect(result.filled.title).toBe(false);
    expect(result.filled.keywords).toBe(false);
    expect(result.present.description).toBe(false);
    expect(document.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("Prefilled from XMP");
  });

  it("opens a file's metadata editor from its row and saves it", () => {
    mount(`
      <table><tbody>
        <tr><td><span>star_01.jpg</span></td><td><button>Edit metadata</button></td></tr>
        <tr><td><span>moon_02.jpg</span></td><td><button>Edit metadata</button></td></tr>
      </tbody></table>`);
    const opened = vi.fn();
    document.querySelectorAll("button")[0].addEventListener("click", opened);
    expect(driver.openFileMetadata({ fileName: "star_01.jpg" })).toEqual({ opened: true, method: "button", label: "Edit metadata" });
    expect(opened).toHaveBeenCalledTimes(1);
    expect(driver.openFileMetadata({ fileName: "absent.jpg" })).toEqual({ opened: false, method: "none", label: null });

    mount('<div role="dialog"><button>Cancel</button><button>Save and close</button></div>');
    const saved = vi.fn();
    document.querySelectorAll("button")[1].addEventListener("click", saved);
    expect(driver.saveMetadataEditor()).toEqual({ saved: true, label: "Save and close" });
    expect(saved).toHaveBeenCalledTimes(1);

    const closed = vi.fn();
    document.querySelectorAll("button")[0].addEventListener("click", closed);
    expect(driver.closeMetadataEditor()).toEqual({ closed: true, label: "Cancel" });
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("dismisses a leftover snackbar or dialog without touching an undismissable one", () => {
    mount(`
      <div data-cy="field-restrictions-loaded-error">
        <p>An error has occurred. Please refresh the page.</p>
        <button data-cy="field-restrictions-loaded-error-dismiss-button">Dismiss</button>
      </div>
      <div role="dialog"><p>Uploading…</p></div>`);
    let dismissed = 0;
    document.querySelector("[data-cy$='-error'] button")!.addEventListener("click", () => { dismissed += 1; });
    expect(driver.dismissPageDialogs()).toEqual({ dismissed: 1, labels: ["Dismiss"] });
    expect(dismissed).toBe(1);
    // A dialog with no dismiss control is left alone rather than guessed at.
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("completes the batch and confirms its dialog", () => {
    mount('<main><button>Add files</button></main>');
    expect(driver.completeBatch()).toEqual({ clicked: false, label: null });
    mount('<main><button>Add files</button><button>Submit batch</button></main>');
    const submit = vi.fn();
    document.querySelectorAll("button")[1].addEventListener("click", submit);
    expect(driver.completeBatch()).toEqual({ clicked: true, label: "Submit batch" });
    expect(submit).toHaveBeenCalledTimes(1);

    expect(driver.confirmCompletion()).toEqual({ confirmed: false, label: null, dialog: false });
    mount('<div role="dialog"><button>Cancel</button><button>Submit</button></div>');
    expect(driver.confirmCompletion()).toEqual({ confirmed: true, label: "Submit", dialog: true });

    mount('<main><button>Submit batch</button><p>Batch submitted for review</p><p>1 In review</p></main>');
    const state = driver.readCompletionState();
    expect(state.canComplete).toBe(true);
    expect(state.submitted).toBe(true);
    expect(state.chips).toMatchObject({ inReview: 1 });
  });

  it("runs the read steps with nothing but the injected prelude in scope", () => {
    // Chrome evaluates `prelude ; (step)(arg)`, so every helper the prelude hands
    // over has to exist there. A helper that is a plain array once serialized to a
    // bare `hidden,checkbox,…` list and the first run died in the page with
    // "ReferenceError: hidden is not defined".
    const run = (name: string, arg: unknown): unknown => (
      new Function(`${driver.PAGE_PRELUDE}; return (${(driver as unknown as Record<string, (a: unknown) => unknown>)[name].toString()})(${JSON.stringify(arg ?? null)});`)()
    );
    expect(run("readPageInfo", null)).toMatchObject({ signedIn: true, createBatch: true });
    expect(run("readUploadState", { names: ["icon_a.jpg"] })).toMatchObject({ namesSeen: ["icon_a.jpg"] });
    expect(run("inspectSignIn", null)).toMatchObject({ inputs: [], arkose: false });
  });

  it("keeps every step serializable: prelude + source evaluates in a page-like scope", () => {
    expect(driver.PAGE_PRELUDE).toContain("function firstVisible");
    const steps = driver as unknown as Record<string, () => unknown>;
    for (const name of driver.DRIVER_STEPS) {
      const source = steps[name].toString();
      expect(() => new Function("document", "location", "Event", `return (${source});`)).not.toThrow();
      expect(() => new Function(`${driver.PAGE_PRELUDE}; return (${source});`)).not.toThrow();
    }
  });
});

// Execute the actual wire-format script, not just module functions: module
// scope can otherwise hide missing declarations in the browser prelude.
describe("serialized Getty page steps", () => {
  it("reads the login page with a declared non-text input list", () => {
    document.body.innerHTML = LOGIN_PAGE + '<input type="hidden" name="token" />';
    const read = new Function(`${driver.PAGE_PRELUDE}\nreturn (${driver.readPageInfo.toString()})();`);
    const info = read();
    expect(info.loginForm).toEqual({ email: true, password: true });
    expect(info.fields).toHaveLength(2);
  });

  it("can evaluate every exported step with the actual browser prelude", () => {
    const steps = driver as unknown as Record<string, (...args: never[]) => unknown>;
    for (const name of driver.DRIVER_STEPS) {
      expect(() => new Function(`${driver.PAGE_PRELUDE}\nreturn (${steps[name].toString()});`)()).not.toThrow();
    }
  });
});

describe("Getty batch page as captured", () => {
  it("counts a paired contribution once, by its stem, and reports it as processing", () => {
    mount(CARD_PAGE);
    const state = driver.readUploadState({ names: ["icon-map-pin_5_01.jpg", "icon-map-pin_5_01.eps"] });
    // Getty lists the pair under one name; both sent files belong to that card.
    expect(state.namesSeen).toEqual(["icon-map-pin_5_01.jpg", "icon-map-pin_5_01.eps"]);
    expect(state.contributions).toEqual(["icon-map-pin_5_01.eps"]);
    expect(state.fileCount).toBe(1);
    expect(state.processing).toBe(true);
    expect(state.ready).toBe(false);
    expect(driver.readUploadState({ names: ["other-icon.jpg"] }).namesSeen).toEqual([]);
  });

  it("reports the card as ready once Getty stops showing its not-ready flag", () => {
    mount(CARD_PAGE.replace('<svg data-cy="not-ready-icon" aria-label="not_ready_to_submit"></svg>', ""));
    const state = driver.readUploadState({ names: ["icon-map-pin_5_01.jpg"] });
    expect(state.ready).toBe(true);
    expect(state.processing).toBe(false);
  });

  // The captured batch page's own validation icon is the only proof that a file
  // may be submitted: `pending-icon` labelled "Ready to submit" replaces the
  // `not-ready-icon` once the metadata is saved.
  const READY_ICON = '<svg data-cy="pending-icon" aria-label="Ready to submit"></svg>';

  it("reads the captured Ready-to-submit validation icon as the upload proof", () => {
    mount(CARD_PAGE
      .replace('<svg data-cy="not-ready-icon" aria-label="not_ready_to_submit"></svg>', READY_ICON)
      .replace('<img data-cy="image-thumbnail" alt="Location pinpointing">',
        '<img data-cy="image-thumbnail" alt="Location pinpointing" src="https://media.gettyimages.com/id/1/icon.jpg">'));
    const state = driver.readUploadState({ names: ["icon-map-pin_5_01.jpg", "icon-map-pin_5_01.eps"] });
    // Both files of the pair belong to the one contribution Getty marked ready.
    expect(state.readyToSubmit).toEqual(["icon-map-pin_5_01.jpg", "icon-map-pin_5_01.eps"]);
    expect(state.awaitingReady).toEqual([]);
    expect(state.uploaded).toEqual(["icon-map-pin_5_01.jpg", "icon-map-pin_5_01.eps"]);
  });

  it("counts a rendered picture as arrival only, never as ready to submit", () => {
    // The picture is what lets the metadata step start; the chip that decides a
    // run is finished only appears after that metadata is saved.
    mount(CARD_PAGE.replace(
      '<img data-cy="image-thumbnail" alt="Location pinpointing">',
      '<img data-cy="image-thumbnail" alt="Location pinpointing" src="https://media.gettyimages.com/id/1/icon.jpg">',
    ));
    const state = driver.readUploadState({ names: ["icon-map-pin_5_01.jpg"] });
    expect(state.uploaded).toEqual(["icon-map-pin_5_01.jpg"]);
    expect(state.processingNames).toEqual([]);
    expect(state.readyToSubmit).toEqual([]);
    expect(state.awaitingReady).toEqual(["icon-map-pin_5_01.jpg"]);
  });

  it("counts a card Getty marked Ready to submit as uploaded even without a picture", () => {
    // The icon alone is the proof: the row may still be rendering its picture.
    mount(CARD_PAGE.replace(
      '<svg data-cy="not-ready-icon" aria-label="not_ready_to_submit"></svg>', READY_ICON,
    ));
    const state = driver.readUploadState({ names: ["icon-map-pin_5_01.jpg"] });
    expect(state.uploaded).toEqual(["icon-map-pin_5_01.jpg"]);
    expect(state.readyToSubmit).toEqual(["icon-map-pin_5_01.jpg"]);
  });

  it("never counts an Upload failed card as ready to submit, whatever it carries", () => {
    mount(CARD_PAGE
      .replace('<div data-cy="image-card"><img data-cy="image-thumbnail" alt="Location pinpointing"></div>',
        `<div data-cy="image-card"><p>Upload failed</p></div>${READY_ICON}`)
      .replace('<svg data-cy="not-ready-icon" aria-label="not_ready_to_submit"></svg>', ""));
    const state = driver.readUploadState({ names: ["icon-map-pin_5_01.jpg"] });
    expect(state.failed).toEqual(["icon-map-pin_5_01.jpg"]);
    expect(state.readyToSubmit).toEqual([]);
    expect(state.awaitingReady).toEqual([]);
  });

  it("reads each card's own outcome: Ready to submit is uploaded, Upload failed is not", () => {
    const uploaded = CARD_PAGE.replace(
      '<svg data-cy="not-ready-icon" aria-label="not_ready_to_submit"></svg>', READY_ICON,
    );
    mount(uploaded);
    const good = driver.readUploadState({ names: ["icon-map-pin_5_01.jpg"] });
    expect(good.uploaded).toEqual(["icon-map-pin_5_01.jpg"]);
    expect(good.failed).toEqual([]);
    expect(good.failures).toEqual([]);

    const failed = CARD_PAGE.replace(
      '<div data-cy="image-card"><img data-cy="image-thumbnail" alt="Location pinpointing"></div>',
      '<div data-cy="image-card"><p>Upload failed</p></div>',
    ).replace("ID: 2302596512", "ID: FSPID51446");
    mount(failed);
    const bad = driver.readUploadState({ names: ["icon-map-pin_5_01.jpg", "icon-map-pin_5_01.eps"] });
    // A rejected card is never an upload, whatever else it renders.
    expect(bad.uploaded).toEqual([]);
    expect(bad.failed).toEqual(["icon-map-pin_5_01.jpg", "icon-map-pin_5_01.eps"]);
    expect(bad.failures).toEqual([{ name: "icon-map-pin_5_01.eps", id: "FSPID51446" }]);
  });

  it("reads the captured page: Ready to submit = uploaded, invalid-file-media = failed", () => {
    // Trimmed from the real batch page: a card carries the BlockIcon
    // (not_ready_to_submit) while ingestion runs and the ReplyIcon
    // (Ready to submit) once Getty validated it — only that second icon counts,
    // even though every card also renders a thumbnail.
    const card = (name: string, id: string, body: string) => `
      <div data-cy="grid-row"><div>
        <div data-cy="item-card">
          <div data-cy="image-card" style="margin: 10px; height: 111px;">${body}</div>
          <div data-cy="item-info">
            <svg data-cy="pending-icon" aria-label="Ready to submit"></svg>
            <p data-cy="contribution-file-name">${name}</p>
            <p data-cy="contribution-id-x">ID: ${id}</p>
          </div>
        </div>
      </div></div>`;
    const thumb = (stem: string) => `<img src="https://da5ld6t38lg51.cloudfront.net/submission/thumbnails/batch_68565984/1_${stem}.jpg" alt="icon" data-cy="image-thumbnail">`;
    const failedCard = (name: string, id: string) => `
      <div data-cy="grid-row"><div>
        <div data-cy="item-card">
          <div class="MuiGrid-root MuiGrid-container MuiGrid-direction-xs-column"><p data-cy="invalid-file-media">Upload failed</p></div>
          <div data-cy="item-info">
            <svg data-cy="not-ready-icon" aria-label="not_ready_to_submit"></svg>
            <p data-cy="contribution-file-name">${name}</p>
            <p data-cy="contribution-id-y">ID: ${id}</p>
          </div>
        </div>
      </div></div>`;
    mount(card("icon-steps-to-goal_8_01_v2.eps", "2302602190", thumb("icon-steps-to-goal_8_01_v2"))
      + failedCard("icon-steps-to-goal_9_03_v3.eps", "2302602220")
      + card("icon-sync-arrows_10_01.eps", "2302602268", thumb("icon-sync-arrows_10_01")));
    const names = [
      "icon-steps-to-goal_8_01_v2.jpg", "icon-steps-to-goal_8_01_v2.eps",
      "icon-steps-to-goal_9_03_v3.jpg", "icon-steps-to-goal_9_03_v3.eps",
      "icon-sync-arrows_10_01.jpg", "icon-sync-arrows_10_01.eps",
    ];
    const state = driver.readUploadState({ names });
    // Only the two cards carrying Getty's validation icon are uploads, although
    // all three render a picture (the failed one replaced it).
    expect(state.uploaded).toEqual([
      "icon-steps-to-goal_8_01_v2.jpg", "icon-steps-to-goal_8_01_v2.eps",
      "icon-sync-arrows_10_01.jpg", "icon-sync-arrows_10_01.eps",
    ]);
    expect(state.failed).toEqual(["icon-steps-to-goal_9_03_v3.jpg", "icon-steps-to-goal_9_03_v3.eps"]);
    expect(state.failures).toEqual([{ name: "icon-steps-to-goal_9_03_v3.eps", id: "2302602220" }]);
    expect(state.processingNames).toEqual([]);
  });

  it("selects a card by stem so the metadata drawer wakes up", () => {
    mount(CARD_PAGE);
    // The drawer enables its fields for the selected contribution only.
    document.querySelector('[data-cy="image-card"]')!.addEventListener("click", () => {
      for (const field of document.querySelectorAll<HTMLTextAreaElement>("[data-cy=metadata-form] textarea")) {
        field.disabled = false;
      }
    });
    const opened = driver.openFileMetadata({ fileName: "icon-map-pin_5_01.jpg" });
    expect(opened).toEqual({ opened: true, method: "card", label: "icon-map-pin_5_01.eps" });
    expect(document.querySelector<HTMLTextAreaElement>('textarea[name="headline"]')!.disabled).toBe(false);
    expect(driver.openFileMetadata({ fileName: "not-this-one.jpg" })).toEqual({ opened: false, method: "none", label: null });
  });

  it("types title, description, keywords and today's Date Created into the drawer", () => {
    mount(CARD_PAGE.replace(/disabled/g, ""));
    const date = "10/10/2026 00:00:00 +0000";
    const filled = driver.fillMetadataFields({
      title: "Foldable paper map", description: "Pin marking a spot.", keywords: ["map", "pin"], dateCreated: date,
    });
    expect(filled.filled).toMatchObject({ title: true, description: true, keywords: true, dateCreated: true });
    expect(document.querySelector<HTMLTextAreaElement>('textarea[name="headline"]')!.value).toBe("Foldable paper map");
    expect(document.querySelector<HTMLTextAreaElement>('textarea[name="created_date"]')!.value).toBe(date);
  });

  it("rewrites the date Getty prefilled so every file can become ready today", () => {
    // The captured drawer already holds a date, and overwrite:false keeps prefilled
    // prose — but the run's date must still land, or cards stay not-ready.
    mount(CARD_PAGE.replace(/disabled/g, ""));
    const seen: string[] = [];
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="created_date"]')!;
    textarea.value = "10/10/2026 00:00:00 +0000";
    textarea.addEventListener("input", () => seen.push(textarea.value));
    textarea.addEventListener("change", () => seen.push(`change:${textarea.value}`));
    const today = "11/02/2026 00:00:00 +0000";
    const filled = driver.fillMetadataFields({ title: "Prefilled", description: "Kept", keywords: ["map"], dateCreated: today, overwrite: false });
    expect(textarea.value).toBe(today);
    // React listens for input+change: both must fire with the new value.
    expect(seen).toContain(today);
    expect(seen).toContain(`change:${today}`);
    expect(filled.filled.dateCreated).toBe(true);
  });

  it("finds the date field by its data-cy when no visible label names it", () => {
    mount(`<div data-cy="metadata-form"><div data-cy="md-created_date">
      <textarea name="created_date"></textarea></div></div>`);
    const filled = driver.fillMetadataFields({ dateCreated: "12/31/2026 00:00:00 +0000" });
    expect(filled.present.dateCreated).toBe(true);
    expect(document.querySelector<HTMLTextAreaElement>('textarea[name="created_date"]')!.value).toBe("12/31/2026 00:00:00 +0000");
  });

  it("leaves the keywords Getty already lists alone instead of doubling them", () => {
    // Getty shows the file's own XMP keywords as chips while the input stays empty,
    // so typing the accepted keywords again is what added extra tags.
    mount(`<div data-cy="metadata-form">
      <div data-cy="md-headline"><label>Title</label><textarea name="headline"></textarea></div>
      <div data-cy="md-created_date"><label>Date Created</label><textarea name="created_date"></textarea></div>
      <div data-cy="metadata-keyword-multiselect">
        <span data-cy="metadata-keyword-current-count">3</span>
        <span data-cy="metadata-keyword-chip">map</span>
        <span data-cy="metadata-keyword-chip">pin</span>
        <span data-cy="metadata-keyword-chip">route</span>
        <textarea id="keywords" placeholder="Add keywords, separated by commas"></textarea>
      </div></div>`);
    const keywords = document.querySelector<HTMLTextAreaElement>("#keywords")!;
    const typed: string[] = [];
    keywords.addEventListener("input", () => typed.push(keywords.value));
    const filled = driver.fillMetadataFields({
      title: "Foldable paper map", description: "", keywords: ["map", "pin", "route"],
      dateCreated: "10/30/2026 00:00:00 +0000",
    });
    expect(filled.filled.keywords).toBe(false);
    expect(keywords.value).toBe("");
    expect(typed).toEqual([]);
    expect(document.querySelectorAll('[data-cy="metadata-keyword-chip"]')).toHaveLength(3);
    // Same number of tags before and after the run, which is the requirement.
    expect(filled).toMatchObject({ keywordsBefore: 3, keywordsAfter: 3 });
    // The date and title are still written.
    expect(filled.filled).toMatchObject({ title: true, dateCreated: true });
    expect(document.querySelector<HTMLTextAreaElement>('textarea[name="created_date"]')!.value)
      .toBe("10/30/2026 00:00:00 +0000");
  });

  it("treats the keyword counter as pre-existing tags too", () => {
    mount(`<div data-cy="metadata-form">
      <div data-cy="metadata-keyword-multiselect">
        <span data-cy="metadata-keyword-current-count">6 keywords</span>
        <textarea id="keywords"></textarea>
      </div></div>`);
    const filled = driver.fillMetadataFields({ keywords: ["charity", "care"] });
    expect(filled.filled.keywords).toBe(false);
    expect(document.querySelector<HTMLTextAreaElement>("#keywords")!.value).toBe("");
  });

  it("only presses Enter in the keyword field, so no stray tag is committed elsewhere", () => {
    mount(`<div data-cy="metadata-form">
      <div data-cy="md-headline"><label>Title</label><textarea name="headline"></textarea></div>
      <div data-cy="md-caption"><label>Description</label><textarea name="caption"></textarea></div>
      <div data-cy="md-created_date"><label>Date Created</label><textarea name="created_date"></textarea></div>
      <div data-cy="metadata-keyword-multiselect"><textarea id="keywords"></textarea></div>
      </div>`);
    const enters: string[] = [];
    for (const field of document.querySelectorAll<HTMLTextAreaElement>("textarea")) {
      field.addEventListener("keydown", (event) => {
        if (event.key === "Enter") enters.push(field.name || field.id);
      });
    }
    driver.fillMetadataFields({
      title: "Foldable paper map", description: "Pin marking a spot.",
      keywords: ["map"], dateCreated: "10/30/2026 00:00:00 +0000",
    });
    expect(enters).toEqual(["keywords"]);
  });

  it("finds Getty's own Save metadata button in the drawer footer", () => {
    mount(`<form data-cy="metadata-form"></form>
      <div><button type="button" data-cy="save-metadata"><p>Save metadata</p></button></div>`);
    let clicked = 0;
    document.querySelector('[data-cy="save-metadata"]')!.addEventListener("click", () => { clicked += 1; });
    expect(driver.saveMetadataEditor()).toEqual({ saved: true, label: "Save metadata" });
    expect(clicked).toBe(1);
  });

  it("selects every contribution with Ctrl when Getty offers no select-all control", () => {
    mount(`<div data-cy="grid-row"><div data-cy="item-card">
        <div data-cy="image-card"></div><p data-cy="contribution-file-name">a.eps</p></div></div>
      <div data-cy="grid-row"><div data-cy="item-card">
        <div data-cy="image-card"></div><p data-cy="contribution-file-name">b.eps</p></div></div>`);
    const modifiers: boolean[] = [];
    for (const card of document.querySelectorAll('[data-cy="image-card"]')) {
      card.addEventListener("click", (event) => modifiers.push((event as MouseEvent).ctrlKey));
    }
    expect(driver.selectAllContributions()).toEqual({ selected: 2, method: "ctrl-click" });
    expect(modifiers).toEqual([true, true]);
  });

  it("uses the page's select-all control when there is one", () => {
    mount(`<input type="checkbox" data-cy="select-all" aria-label="Select all" />
      <div data-cy="grid-row"><div data-cy="item-card"><div data-cy="image-card"></div>
        <p data-cy="contribution-file-name">a.eps</p></div></div>`);
    const box = document.querySelector<HTMLInputElement>('[data-cy="select-all"]')!;
    let clicked = 0;
    box.addEventListener("click", () => { clicked += 1; });
    expect(driver.selectAllContributions()).toEqual({ selected: 1, method: "select-all" });
    expect(clicked).toBe(1);
  });

  it("tells apart a drawer that is still a loading skeleton from one that is loaded", () => {
    // Getty renders the drawer as MUI skeleton placeholders while the file is
    // still being processed; nothing can be typed into that, and it is the page,
    // not the file, that has to be reloaded.
    mount(`<div data-cy="metadata-drawer"><div data-cy="metadata-skeleton">
      <span class="MuiSkeleton-root MuiSkeleton-text MuiSkeleton-pulse"></span>
    </div></div>`);
    expect(driver.metadataEditorReady()).toEqual({ ready: false, present: false, skeleton: true });
    mount(CARD_PAGE.replace(/disabled/g, ""));
    expect(driver.metadataEditorReady()).toEqual({ ready: true, present: true, skeleton: false });
  });

  it("reports the metadata editor as not ready while its fields are still disabled", () => {
    mount(CARD_PAGE);
    expect(driver.metadataEditorReady()).toMatchObject({ ready: false, present: true });
    mount(CARD_PAGE.replace(/disabled/g, ""));
    expect(driver.metadataEditorReady()).toMatchObject({ ready: true, present: true });
    mount(BATCHES_PAGE);
    expect(driver.metadataEditorReady()).toMatchObject({ ready: false, present: false });
  });
});
