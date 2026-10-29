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
