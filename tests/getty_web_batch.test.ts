// Real serialized driver steps and CDP expressions against the supplied MUI
// dialog shape. No queued success replies that could hide selector errors.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachFiles, createBatch, finishBatch } from "../tools/bridge/gettyweb/contribute.mjs";

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

// The captured batch page lists a vector pair once — under the EPS name — and the
// card carries a not_ready_to_submit flag while Getty processes the image.
// A card Getty accepted renders its thumbnail; a rejected one says "Upload failed".
const card = (name: string, processing = false, failed = false) => `
  <div data-cy="grid-row"><div data-cy="item-card">
    <div data-cy="image-card">
      ${failed ? "<p>Upload failed</p>" : `<img data-cy="image-thumbnail" alt="icon" src="https://media.gettyimages.com/id/${name}.jpg">`}
    </div>
    <div data-cy="item-info">
      ${processing ? '<svg data-cy="not-ready-icon" aria-label="not_ready_to_submit"></svg>' : ""}
      <p data-cy="contribution-file-name">${name}</p>
      <p>ID: FSPID51446</p>
    </div>
  </div></div>`;

/** A page that lists the contribution only after `delayMs`, like Getty does. */
class LateCardPage extends DomConnection {
  constructor(private readonly delayMs: number, private readonly name = "icon-map-pin_5_01.eps", private readonly processing = false) {
    super();
  }
  override async send(method: string, params: Record<string, unknown>) {
    const answer = await super.send(method, params);
    if (method === "DOM.setFileInputFiles") {
      setTimeout(() => document.body.insertAdjacentHTML("beforeend", card(this.name, this.processing)), this.delayMs);
    }
    return answer;
  }
}

const PAIR = ["icon-map-pin_5_01.jpg", "icon-map-pin_5_01.eps"];
const UPLOADER = `<button data-cy="open-upload-dialog-button">Upload</button>
  <input type="file" multiple data-cy="upload-button-file-input" style="display:none">`;

/** Mounts the batch page with its uploader, which is all attachFiles needs. */
function mountBatchPage() {
  document.body.innerHTML = UPLOADER;
}

describe("Getty web upload verification", () => {
  it("counts a pair listed under one name as both files uploaded, and waits for the card", async () => {
    vi.useFakeTimers();
    try {
      mountBatchPage();
      const page = new LateCardPage(4000);
      const progress: string[] = [];
      const result = attachFiles(page, "page", {
        paths: ["/staged/icon-map-pin_5_01.jpg", "/staged/icon-map-pin_5_01.eps"], names: PAIR,
        onProgress: (line: string) => progress.push(line),
      });
      await vi.advanceTimersByTimeAsync(2000);
      expect(progress.some((line) => /Getty listed 0\/2/.test(line))).toBe(true);
      await vi.advanceTimersByTimeAsync(4000);
      const settled = await result;
      expect(settled.ok).toBe(true);
      expect(settled.state).toMatchObject({ contributions: ["icon-map-pin_5_01.eps"], fileCount: 1, ready: true });
      expect(settled.state.namesSeen).toEqual(PAIR);
      // A picture in the card is what counts as uploaded.
      expect(settled.state.uploaded).toEqual(PAIR);
      expect(settled.state.failed).toEqual([]);
      expect(progress.some((line) => /Getty listed 2\/2/.test(line))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hands every icon's pair to the uploader in one call and waits for all of them", async () => {
    mountBatchPage();
    const names = ["star_01.jpg", "star_01.eps", "moon_02.jpg", "moon_02.eps"];
    const page = new DomConnection();
    const insertCards = () => document.body.insertAdjacentHTML(
      "beforeend", card("star_01.eps") + card("moon_02.eps"),
    );
    setTimeout(insertCards, 0);
    const result = await attachFiles(page, "page", {
      paths: names.map((name) => `/staged/${name}`), names,
      timeoutMs: 3000, readyTimeoutMs: 1000,
    });
    expect(page.attachmentCalls).toBe(1);
    expect(page.attached).toEqual(names.map((name) => `/staged/${name}`));
    expect(result.ok).toBe(true);
    expect(result.state.namesSeen).toEqual(names);
    expect(result.state.contributions).toEqual(["star_01.eps", "moon_02.eps"]);
  });

  it("reports each file as it lands, then counts only the ones with a thumbnail", async () => {
    vi.useFakeTimers();
    try {
      mountBatchPage();
      const page = new LateCardPage(1000, "icon-map-pin_5_01.eps", true);
      const progress: string[] = [];
      const result = attachFiles(page, "page", {
        paths: ["/staged/icon-map-pin_5_01.jpg"], names: ["icon-map-pin_5_01.jpg"],
        readyTimeoutMs: 3000, onProgress: (line: string) => progress.push(line),
      });
      await vi.advanceTimersByTimeAsync(5000);
      const done = await result;
      expect(done.ok).toBe(true);
      // The thumbnail is there, so the file counts as uploaded even while Getty
      // still reports it as processing — and the panel said so as it happened.
      expect(done.state.uploaded).toEqual(["icon-map-pin_5_01.jpg"]);
      expect(done.state.processing).toBe(true);
      expect(progress.some((line) => /Getty uploaded 1\/1/.test(line))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never counts a card reading Upload failed as uploaded, and names its id", async () => {
    mountBatchPage();
    document.body.insertAdjacentHTML("beforeend", card("icon-megaphone_5_01.eps", false, true));
    const result = await attachFiles(new DomConnection(), "page", {
      paths: ["/staged/icon-megaphone_5_01.jpg", "/staged/icon-megaphone_5_01.eps"],
      names: ["icon-megaphone_5_01.jpg", "icon-megaphone_5_01.eps"],
      timeoutMs: 2000, readyTimeoutMs: 200,
    });
    expect(result.ok).toBe(true);
    expect(result.state.uploaded).toEqual([]);
    expect(result.state.failed).toEqual(["icon-megaphone_5_01.jpg", "icon-megaphone_5_01.eps"]);
    expect(result.state.failures).toEqual([{ name: "icon-megaphone_5_01.eps", id: "FSPID51446" }]);
  });

  it("fails with the count when a card never appears", async () => {
    vi.useFakeTimers();
    try {
      mountBatchPage();
      const page = new DomConnection();
      const result = attachFiles(page, "page", {
        paths: ["/staged/ghost.jpg", "/staged/ghost.eps"], names: ["ghost.jpg", "ghost.eps"],
        timeoutMs: 3000, readyTimeoutMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(4000);
      const failed = await result;
      expect(failed).toMatchObject({ ok: false, code: "timeout" });
      expect(failed.reason).toContain("0 of 2");
      expect(failed.state.missing).toEqual(["ghost.jpg", "ghost.eps"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("completing one batch for several icons", () => {
  const card = (name: string) => `
    <div data-cy="grid-row"><div data-cy="item-card">
      <div data-cy="image-card"></div>
      <p data-cy="contribution-file-name">${name}</p>
    </div></div>`;
  const submit = `<button data-cy="open-upload-dialog-button">Upload</button>
    <button type="button">SUBMIT</button><p>0 Not submitted</p>`;
  const EXPECTED = ["icon-map-pin_5_01.jpg", "icon-map-pin_5_01.eps", "icon-map-pin_5_02.jpg", "icon-map-pin_5_02.eps"];

  it("refuses to submit a batch that is still missing a contribution", async () => {
    document.body.innerHTML = submit + card("icon-map-pin_5_01.eps");
    let clicks = 0;
    document.querySelectorAll("button")[1].addEventListener("click", () => { clicks += 1; });
    const result = await finishBatch(new DomConnection(), "page", { expected: EXPECTED });
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(result.reason).toContain("1 of 2 contribution(s)");
    expect(clicks).toBe(0);
  });

  it("submits once when every contribution is listed, and reports the result", async () => {
    document.body.innerHTML = submit + card("icon-map-pin_5_01.eps") + card("icon-map-pin_5_02.eps");
    document.querySelectorAll("button")[1].addEventListener("click", () => {
      document.body.insertAdjacentHTML("beforeend", "<p>Batch submitted for review</p>");
    });
    const result = await finishBatch(new DomConnection(), "page", { expected: EXPECTED });
    expect(result.ok).toBe(true);
    expect(result.report.completion).toMatchObject({ clicked: true, label: "SUBMIT" });
    expect(result.report.state.submitted).toBe(true);
  });

  it("refuses to submit while a card says Upload failed", async () => {
    document.body.innerHTML = submit + card("icon-map-pin_5_01.eps") + `
      <div data-cy="grid-row"><div data-cy="item-card">
        <div data-cy="image-card"><p>Upload failed</p></div>
        <p data-cy="contribution-file-name">icon-map-pin_5_02.eps</p>
      </div></div>`;
    let clicks = 0;
    document.querySelectorAll("button")[1].addEventListener("click", () => { clicks += 1; });
    const result = await finishBatch(new DomConnection(), "page", { expected: EXPECTED });
    expect(result).toMatchObject({ ok: false, code: "page" });
    expect(result.reason).toContain('"Upload failed" for 1 of 2');
    expect(clicks).toBe(0);
  });

  it("dismisses a leftover dialog before attaching the next icon's files", async () => {
    document.body.innerHTML = `${UPLOADER}
      <div role="dialog"><p>An error has occurred. Please refresh the page.</p>
        <button>Dismiss</button></div>`;
    let dismissed = 0;
    document.querySelector('[role="dialog"] button')!.addEventListener("click", () => { dismissed += 1; });
    const page = new DomConnection();
    const result = await attachFiles(page, "page", {
      paths: ["/staged/icon-map-pin_5_02.jpg"], names: ["icon-map-pin_5_02.jpg"],
      timeoutMs: 2000, readyTimeoutMs: 1000,
    });
    // The snackbar was dismissed before attaching, so the upload still went out.
    expect(dismissed).toBe(1);
    expect(page.attachmentCalls).toBe(1);
    expect(result).toMatchObject({ ok: false, code: "timeout" });
  });
});
