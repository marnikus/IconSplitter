// log_svg_flow.test.tsx — what the Generate SVG tab tells the log, driven through
// the REAL panel, runner and a scripted fetch (RULE 8): the scan, the key, a model
// change, an edit of the rules (length + hash only), the confirmation and a whole
// run in order under ONE run id — the very run id the confirmation accepted —
// and a cancelled run. (This branch's confirmation has no fingerprint to carry —
// the request logs its composite hash instead.)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOG_DATA_KEYS } from "../src/lib/logentry";
import { log } from "../src/log/logger";
import { getLog, resetLog } from "../src/log/logstore";
import { resetBoot } from "../src/log/boot";
import { resetAppStore } from "../src/state/appstore";
import { saveApiKey } from "../src/svg/keystore";
import { FakeStorage } from "./helpers/fakestorage";
import { PLAIN_SECRET, input } from "./helpers/logfix";
import { KEY, block, okReply, stemOf, stubCanvas, stubFetchSeq, stubOffline } from "./helpers/svgrun";
import { approvedRoot, click, idOf, mountSvg, openConfirm, typeInto, until, type SvgMount } from "./helpers/svgmount";
import { stored } from "./helpers/svgstore";

vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  const { stored: map } = await import("./helpers/svgstore");
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { map.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => map.get(name) ?? null),
  };
});

vi.mock("../src/lib/dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/dom")>();
  return {
    ...actual,
    loadImageFile: vi.fn(async () => ({ naturalWidth: 100, naturalHeight: 100 })),
    blobToDataUrl: vi.fn(async () => "data:image/png;base64,AAAA"),
  };
});

let m: SvgMount | null = null;
const q = (sel: string) => m?.q(sel) ?? null;
const kinds = () => getLog().entries.map((e) => `${e.feature}.${e.action}`);
const entriesOf = (kind: string) => getLog().entries.filter((e) => `${e.feature}.${e.action}` === kind);

beforeEach(async () => {
  vi.stubGlobal("localStorage", new FakeStorage());
  stored.clear();
  resetLog();
  resetBoot();
  resetAppStore();
  stubCanvas();
  stubOffline();
  await saveApiKey(KEY);
});

afterEach(async () => {
  await m?.unmount();
  m = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open(names: string[], confirm = true): Promise<void> {
  m = await mountSvg(approvedRoot(names));
  if (confirm) await openConfirm(m);
}

const answer = (names: string[]) => okReply(names.map((n) => block(stemOf(n))).join("\n"));
const running = () => q("[data-testid=svg-status-running]") !== null;

describe("the scan", () => {
  it("records what it found", async () => {
    await open(["alder", "birch", "cedar"], false);
    const scans = entriesOf("svg.scan.done");
    expect(scans).toHaveLength(1);
    expect(scans[0]).toMatchObject({ level: "info", data: { approved: 3, missing: 0, unreadable: 0, corrupt: false } });
  });
});

describe("the provider key", () => {
  const save = async (value: string) => {
    await click(m!, "[data-testid=svg-key-state]");
    await typeInto(m!, "[data-testid=svg-key-input]", value);
    await click(m!, "[data-testid=svg-key-save]");
  };

  it("records a save by WHERE it landed — never the key — and masks it from then on", async () => {
    await open(["alder"], false);
    await save(PLAIN_SECRET);
    const [saved] = entriesOf("svg.key.save");
    expect(saved).toMatchObject({ level: "warn", data: { where: "session" } }); // no IndexedDB in this DOM: honest about it
    expect(JSON.stringify(getLog().entries)).not.toContain(PLAIN_SECRET);
    log(input({ message: `a stray ${PLAIN_SECRET}` }));
    expect(JSON.stringify(getLog().entries)).not.toContain(PLAIN_SECRET);
  });

  it("records a clear", async () => {
    await open(["alder"], false);
    await save(PLAIN_SECRET);
    await save("");
    expect(entriesOf("svg.key.clear")).toHaveLength(1);
    expect(entriesOf("svg.key.clear")[0].level).toBe("info");
  });
});

describe("the model and the rules", () => {
  it("records a model change — not the first resolution on mount", async () => {
    await open(["alder"], false);
    expect(entriesOf("svg.model.change")).toHaveLength(0);
    if (q("[data-testid=svg-model]") === null) await click(m!, "[data-testid=svg-provider-toggle]");
    await typeInto(m!, "[data-testid=svg-model]", "openai/gpt-4o");
    const changes = entriesOf("svg.model.change");
    expect(changes).toHaveLength(1);
    expect(changes[0].data).toMatchObject({ model: "openai/gpt-4o", reasoning: false });
    expect(typeof changes[0].data.resetCount).toBe("number");
  });

  it("records an edit of the rules by length and hash — never the text", async () => {
    await open(["alder", "birch"], false);
    await typeInto(m!, "[data-testid=svg-prompt]", "Rules typed on the tab, very secret wording");
    const edit = entriesOf("svg.rules.edit").at(-1);
    expect(edit?.data.chars).toBe("Rules typed on the tab, very secret wording".length);
    expect(String(edit?.data.hash)).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(getLog().entries)).not.toMatch(/secret wording/);
  });
});

describe("the confirmation and a run", () => {
  it("tells the whole story in order, under one run id", async () => {
    const calls = stubFetchSeq([answer(["alder", "birch"])]);
    await open(["alder", "birch"]);
    expect(entriesOf("svg.confirm.open")[0]).toMatchObject({ data: { selected: 2, requests: 1 } });
    await click(m!, "[data-testid=svg-confirm-generate]");
    await until(() => calls.length === 1 && !running());
    await until(() => entriesOf("svg.run.done").length === 1);

    const story = kinds().filter((k) => k.startsWith("svg.") && k !== "svg.status");
    expect(story).toEqual([
      "svg.scan.done", "svg.confirm.open", "svg.confirm.accept", "svg.run.start", "svg.batch.start", "svg.request.sent",
      "svg.request.ok", "svg.item.saved", "svg.item.saved", "svg.batch.done", "svg.run.done",
    ]);
    const accept = entriesOf("svg.confirm.accept")[0];
    const runId = accept.ids.run as string;
    expect(runId).toMatch(/^run_[a-z0-9]+_[a-z0-9]+$/);
    expect(accept.data).toMatchObject({ selected: 2, requests: 1 });
    const run = getLog().entries.filter((e) => ["run", "batch", "request", "item"].some((p) => e.action.startsWith(p)));
    expect(new Set(run.map((e) => e.ids.run))).toEqual(new Set([runId]));
    expect(entriesOf("svg.request.sent")[0].data).toMatchObject({ attempt: 1, of: 3, model: "openai/gpt-6.1-sol" });
    expect(String(entriesOf("svg.request.sent")[0].data.hash)).toMatch(/^[0-9a-f]{8}$/);
    expect(entriesOf("svg.request.ok")[0]).toMatchObject({ data: { status: 200, attempt: 1 }, usage: { input: 10, output: 20, total: 30, cost: 0.01 } });
    expect(entriesOf("svg.item.saved").map((e) => e.ids.source)).toEqual([idOf("alder"), idOf("birch")]);
    expect(entriesOf("svg.run.done")[0]).toMatchObject({ level: "info", data: { saved: 2, failed: 0, missing: 0, invalid: 0, cancelled: false } });
    expect(entriesOf("svg.run.done")[0].message).toBe(entriesOf("svg.status").at(-1)?.message);
    for (const e of getLog().entries) for (const k of Object.keys(e.data)) expect(LOG_DATA_KEYS.has(k), `${e.action}.${k}`).toBe(true);
  });

  it("records Cancel of the confirmation", async () => {
    await open(["alder", "birch"]);
    await click(m!, "[data-testid=svg-confirm-cancel]");
    expect(kinds().filter((k) => k.startsWith("svg.confirm"))).toEqual(["svg.confirm.open", "svg.confirm.cancel"]);
    expect(entriesOf("svg.confirm.cancel")[0].data).toMatchObject({ selected: 2 });
  });

  it("records the user's Cancel of a running run, then the run's end as cancelled", async () => {
    stubFetchSeq(["hang"]);
    await open(["alder", "birch"]);
    await click(m!, "[data-testid=svg-confirm-generate]");
    await until(() => q("[data-testid=svg-cancel-run]") !== null);
    await click(m!, "[data-testid=svg-cancel-run]");
    await until(() => entriesOf("svg.run.done").length === 1);
    const cancel = entriesOf("svg.run.cancel")[0];
    const accept = entriesOf("svg.confirm.accept")[0];
    expect(cancel).toMatchObject({ level: "warn", ids: { run: accept.ids.run } });
    expect(entriesOf("svg.run.done")[0]).toMatchObject({ level: "warn", data: { cancelled: true, saved: 0 } });
    expect(entriesOf("svg.request.failed")[0]).toMatchObject({ level: "error", data: { kind: "aborted" } });
  });

  it("records a request that failed and why, without a retry it cannot earn", async () => {
    const calls = stubFetchSeq([new Response(JSON.stringify({ error: { message: "boom" } }), { status: 400 })]);
    await open(["alder", "birch"]);
    await click(m!, "[data-testid=svg-confirm-generate]");
    await until(() => calls.length === 1 && !running());
    await until(() => entriesOf("svg.run.done").length === 1);
    expect(entriesOf("svg.request.failed")[0]).toMatchObject({ level: "error", data: { kind: "payload", count: 2 } });
    expect(entriesOf("svg.item.failed")).toHaveLength(2);
    expect(entriesOf("svg.run.done")[0]).toMatchObject({ level: "warn", data: { saved: 0, failed: 2 } });
  });
});
