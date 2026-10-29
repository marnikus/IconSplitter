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
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(driver.readPageInfo().dialogOpen).toBe(true);

    expect(driver.fillBatchDetails({ batchName: "IconSplitter 2026-10-29 (3 icons)" })).toEqual({ filled: true, reason: null });
    expect(document.querySelector<HTMLInputElement>('input[name="submission_name"]')!.value)
      .toBe("IconSplitter 2026-10-29 (3 icons)");

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
    expect(result).toEqual({
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
