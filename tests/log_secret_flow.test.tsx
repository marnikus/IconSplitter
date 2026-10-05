// log_secret_flow.test.tsx — the stated verification, end to end (RULE 20): a
// provider that answers with the key, an Authorization header and a data URL
// (what a misbehaving gateway might echo) must leave NONE of them in the log, in
// anything written to storage, or in the Copy-all text; and a key pasted into
// the rules is logged by length and hash only. Driven through the real panel,
// runner, store and storage (an in-memory Storage that can be searched).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { log } from "../src/log/logger";
import { copyAllText, flushLog, getLog, resetLog } from "../src/log/logstore";
import { resetBoot } from "../src/log/boot";
import { resetAppStore } from "../src/state/appstore";
import { saveApiKey } from "../src/svg/keystore";
import { FakeStorage } from "./helpers/fakestorage";
import { input } from "./helpers/logfix";
import { failReply, stubCanvas, stubFetchSeq, stubOffline } from "./helpers/svgrun";
import { approvedRoot, click, mountSvg, openConfirm, typeInto, until, type SvgMount } from "./helpers/svgmount";
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

// Assembled from parts so no key-shaped literal is committed (hygiene test): one of
// a KNOWN shape, one of NO known shape — only the registry can catch the second.
const SHAPED = ["rq", "live", "Zx9QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");
const SHAPELESS = ["gateway", "credential", "Q7wErTyUiOpAsDfGhJk"].join("-");
const BLOB = `data:image/png;base64,${"QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=".repeat(8)}`;
const ECHO = `denied for ${SHAPELESS}; Authorization: Bearer ${SHAPELESS}; header ${SHAPED}; image ${BLOB}`;

let m: SvgMount | null = null;
let disk: FakeStorage;

/** Everything the app could have shown or kept: the log, the text it would copy, and every stored value. */
function everywhere(): string {
  const stores = [...Array(disk.length).keys()].map((i) => disk.getItem(disk.key(i) as string) ?? "");
  return [JSON.stringify(getLog().entries), copyAllText(), ...stores].join("\n");
}

beforeEach(async () => {
  disk = new FakeStorage();
  vi.stubGlobal("localStorage", disk);
  stored.clear();
  resetLog();
  resetBoot();
  resetAppStore();
  stubCanvas();
  stubOffline();
  await saveApiKey(SHAPELESS);
});

afterEach(async () => {
  await m?.unmount();
  m = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function runWith(status: number): Promise<void> {
  // retry-after 0: a retryable failure is retried at once, so the echo travels through request.retry too
  const calls = stubFetchSeq([failReply(status, ECHO, { "retry-after": "0" })]);
  m = await mountSvg(approvedRoot(["alder", "birch"]));
  await openConfirm(m);
  await click(m, "[data-testid=svg-confirm-generate]");
  await until(() => getLog().entries.some((e) => e.action === "run.done"));
  expect(calls.length).toBeGreaterThanOrEqual(1);
  flushLog();
}

describe("a provider that echoes secrets back", () => {
  it.each([[401], [500]])("leaves no key, header or image in the log, storage or Copy-all after a %i", async (status) => {
    await runWith(status);
    const seen = everywhere();
    expect(getLog().entries.some((e) => e.action === "request.failed")).toBe(true);
    expect(seen).not.toContain(SHAPELESS);
    expect(seen).not.toContain(SHAPED);
    expect(seen).not.toContain(`Bearer ${SHAPELESS}`);
    expect(seen).not.toContain("QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=");
    expect(seen).not.toMatch(/data:image\/png;base64,[A-Za-z0-9+/=]{20,}/);
  });

  it("still says what happened — the masked text, the kind and the status are there", async () => {
    await runWith(500);
    const failed = getLog().entries.find((e) => e.action === "request.failed");
    expect(failed).toMatchObject({ level: "error", data: { kind: "provider" } });
    expect(String(failed?.data.reason)).toContain("500");
    expect(String(failed?.data.reason)).toContain("‹");
  });

  it("keeps the provider's answer out of the toast-mirrored status line too", async () => {
    await runWith(401);
    const status = getLog().entries.filter((e) => e.action === "status").map((e) => e.message).join("\n");
    expect(status).not.toContain(SHAPELESS);
    expect(status).not.toContain(SHAPED);
  });
});

describe("a key pasted into the rules", () => {
  it("is logged by length and hash only, in the tab and in the popup", async () => {
    m = await mountSvg(approvedRoot(["alder", "birch"]));
    const pasted = `use this key ${SHAPED} and also ${SHAPELESS}`;
    await typeInto(m, "[data-testid=svg-prompt]", pasted);
    await openConfirm(m);
    await typeInto(m, "[data-testid=svg-confirm-rules]", `${pasted} again`);
    const edits = getLog().entries.filter((e) => e.action === "rules.edit");
    expect(edits.length).toBeGreaterThanOrEqual(1);
    const logged = [JSON.stringify(getLog().entries), copyAllText()].join("\n");
    expect(logged).not.toContain(SHAPED);
    expect(logged).not.toContain(SHAPELESS);
    expect(logged).not.toContain("use this key");
    expect(edits.at(-1)?.data.chars).toBe(`${pasted} again`.length);
  });
});

describe("the log's own writes", () => {
  it("never carry a secret registered after an entry was stored", () => {
    log(input({ message: "written before the secret was known: late-credential-ValueNobodyKnew1" }));
    expect(copyAllText()).toContain("late-credential-ValueNobodyKnew1");
    return saveApiKey("late-credential-ValueNobodyKnew1").then(() => {
      expect(copyAllText()).not.toContain("late-credential-ValueNobodyKnew1");
    });
  });
});
