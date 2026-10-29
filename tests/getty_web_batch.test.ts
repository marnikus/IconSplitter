// Real serialized driver steps and CDP expressions against the supplied MUI
// dialog shape. No queued success replies that could hide selector errors.
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  attachmentCalls = 0;
  attachedInput = "";
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
        document.body.innerHTML = `<input type="file" accept="image/jpeg" data-cy="model-release-input">
          <input type="file" multiple data-cy="drag-n-drop-input" style="display:none">
          <input type="file" multiple data-cy="upload-button-file-input"
            accept="image/jpeg,application/postscript,image/x-eps" style="display:none">
          <p>0 Not submitted</p>`;
      });
    });
  }
  async send(method: string, params: Record<string, unknown>) {
    if (method === "DOM.setFileInputFiles") {
      this.attachmentCalls++;
      this.attachedInput = String(params.objectId);
      this.attached = params.files as string[];
      document.body.insertAdjacentHTML("beforeend", "<p>selected.jpg selected.eps</p>");
      return {};
    }
    if (method === "Runtime.evaluate") {
      const expression = String(params.expression);
      const value = new Function(`return (${expression})`)();
      if (params.returnByValue === false) {
        const input = value as HTMLInputElement | null;
        return { result: input ? { objectId: input.getAttribute("data-cy") } : {} };
      }
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
    expect(connection.attachmentCalls).toBe(1);
    expect(connection.attachedInput).toBe("upload-button-file-input");
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


it("polls until the Create Batch control becomes enabled after five seconds", async () => {
  vi.useFakeTimers();
  try {
    const connection = new DomConnection();
    const button = document.querySelector<HTMLButtonElement>("button")!;
    button.disabled = true;
    setTimeout(() => { button.disabled = false; }, 5000);
    const result = createBatch(connection, "page", { batchName: "Delayed page" });
    await vi.advanceTimersByTimeAsync(6000);
    expect(await result).toEqual({ ok: true, batchId: "987654" });
    expect(connection.submittedName).toBe("Delayed page");
  } finally {
    vi.useRealTimers();
  }
});

it("gives up after sixty seconds without clicking an unavailable control", async () => {
  vi.useFakeTimers();
  try {
    const connection = new DomConnection();
    document.querySelector<HTMLButtonElement>("button")!.disabled = true;
    const result = createBatch(connection, "page", {});
    await vi.advanceTimersByTimeAsync(60000);
    expect(await result).toMatchObject({ ok: false, code: "timeout" });
    expect(connection.submittedName).toBe("");
    expect(connection.attached).toEqual([]);
  } finally {
    vi.useRealTimers();
  }
});


it("never falls back to release inputs when the contribution uploader is missing", async () => {
  vi.useFakeTimers();
  try {
    const connection = new DomConnection();
    document.body.innerHTML = '<input type="file" accept="image/jpeg" data-cy="property-release-input">';
    const result = attachFiles(connection, "page", {
      paths: ["/staged/icon.jpg", "/staged/icon.eps"], names: ["icon.jpg", "icon.eps"],
    });
    await vi.advanceTimersByTimeAsync(60000);
    expect(await result).toMatchObject({ ok: false, code: "page" });
    expect(connection.attachmentCalls).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it("waits for the hidden contribution uploader instead of using an existing release input", async () => {
  vi.useFakeTimers();
  try {
    const connection = new DomConnection();
    document.body.innerHTML = '<input type="file" data-cy="model-release-input">';
    setTimeout(() => {
      document.body.insertAdjacentHTML("beforeend", '<input type="file" multiple data-cy="upload-button-file-input" style="display:none">');
    }, 5000);
    const result = attachFiles(connection, "page", {
      paths: ["/staged/selected.jpg", "/staged/selected.eps"], names: ["selected.jpg", "selected.eps"],
    });
    await vi.advanceTimersByTimeAsync(6000);
    expect((await result).ok).toBe(true);
    expect(connection.attachedInput).toBe("upload-button-file-input");
    expect(connection.attachmentCalls).toBe(1);
    expect(connection.attached).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
});
