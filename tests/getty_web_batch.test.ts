// Real serialized driver steps and CDP expressions against the supplied MUI
// dialog shape. No queued success replies that could hide selector errors.
import { beforeEach, describe, expect, it } from "vitest";
import { attachFiles, createBatch } from "../tools/bridge/gettyweb/contribute.mjs";

const TYPE = "iStock creative illustration";
const DIALOG = `<div role="dialog" aria-labelledby="create-batch-dialog" aria-modal="true">
<form><h2 id="create-batch-dialog">Create Batch</h2>
<div data-cy="create-batch-submission-type"><div role="combobox" tabindex="0">${TYPE}</div>
<input name="submission_type" aria-hidden="true" value="istock_creative_illustration"></div>
<label for="brief">Brief code (optional)</label><input id="brief" name="event_id">
<label for="batch">Batch name</label><input id="batch" name="submission_name">
<button type="button" data-cy="create-batch-cancel-button">Cancel</button>
<button type="submit" data-cy="create-batch-confirm-button">Create</button></form></div>`;

class DomConnection {
  submittedName = "";
  submittedType = TYPE;
  attached: string[] = [];
  openedMenus = 0;
  failCreation = false;
  constructor(initialType = TYPE, delayedOptions = false) {
    document.querySelector("button")!.addEventListener("click", () => {
      document.body.insertAdjacentHTML("beforeend", DIALOG);
      const combo = document.querySelector('[role="combobox"]')!;
      combo.textContent = initialType;
      combo.addEventListener("mousedown", () => {
        this.openedMenus++;
        const render = () => {
          document.body.insertAdjacentHTML("beforeend", `<ul role="listbox"><li role="option">${TYPE}</li></ul>`);
          document.querySelector('[role="option"]')!.addEventListener("click", () => {
            combo.textContent = TYPE;
            document.querySelector('[role="listbox"]')!.remove();
          });
        };
        if (delayedOptions) setTimeout(render, 20);
        else render();
      });
      document.querySelector("form")!.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submittedName = document.querySelector<HTMLInputElement>('[name="submission_name"]')!.value;
        this.submittedType = combo.textContent!;
        if (this.failCreation) return;
        window.history.replaceState({}, "", "/contribute/batches/987654");
        document.body.innerHTML = '<input type="file" multiple><p>0 Not submitted</p>';
      });
    });
  }
  async send(method: string, params: Record<string, unknown>) {
    if (method === "DOM.setFileInputFiles") {
      this.attached = params.files as string[];
      document.body.insertAdjacentHTML("beforeend", "<p>selected.jpg selected.eps</p>");
      return {};
    }
    if (method === "Runtime.evaluate") {
      const expression = String(params.expression);
      const split = expression.lastIndexOf("\n;(");
      const code = split < 0 ? `return (${expression})`
        : `${expression.slice(0, split)}\nreturn ${expression.slice(split + 2)}`;
      const value = new Function(code)();
      if (params.returnByValue === false) return { result: { objectId: "file-input" } };
      return { result: { value } };
    }
    return {};
  }
}

beforeEach(() => {
  window.history.replaceState({}, "", "/contribute/batches");
  document.body.innerHTML = '<button data-cy="create-batch-button">Create Batch</button>';
});

describe("Getty MUI batch creation and attachment", () => {
  it("recognizes the real dialog, uses the selected type, creates a named batch and attaches selected files", async () => {
    const connection = new DomConnection();
    const created = await createBatch(connection, "page", { batchName: "Selected icons", submissionType: TYPE });
    expect(created).toEqual({ ok: true, batchId: "987654" });
    expect(connection.submittedName).toBe("Selected icons");
    expect(connection.openedMenus).toBe(0);
    const uploaded = await attachFiles(connection, "page", {
      paths: ["/staged/selected.jpg", "/staged/selected.eps"], names: ["selected.jpg", "selected.eps"],
    });
    expect(uploaded.ok).toBe(true);
    expect(connection.attached).toEqual(["/staged/selected.jpg", "/staged/selected.eps"]);
  });

  it("opens MUI with mousedown, waits for portal options and supplies a name when blank", async () => {
    const connection = new DomConnection("iStock creative image", true);
    const created = await createBatch(connection, "page", { batchName: "  ", submissionType: TYPE });
    expect(created.ok).toBe(true);
    expect(connection.openedMenus).toBe(1);
    expect(connection.submittedType).toBe(TYPE);
    expect(connection.submittedName).toMatch(/^IconSplitter /);
  });

  it("does not mistake an existing batch URL for a newly created batch", async () => {
    window.history.replaceState({}, "", "/contribute/batches/12345");
    const connection = new DomConnection();
    connection.failCreation = true;
    const created = await createBatch(connection, "page", { batchName: "New batch", timeoutMs: 1 });
    expect(created).toMatchObject({ ok: false, code: "timeout" });
    expect(connection.attached).toEqual([]);
  });
});
