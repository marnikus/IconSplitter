// log_taps.test.tsx — the app tells the log what it does (log-contract.md §4, L-4).
// Each tap is exercised through the REAL feature: the tab store, the history
// provider, every panel's toast (the four `say`s AND the six direct toast writes
// — each must appear once, with the toast's own text and a level from `err`), the
// batch process, and the key store's secret registry (RULE 8).
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBatch } from "../src/batch/useBatch";
import { defaultPreset } from "../src/lib/presets";
import { log } from "../src/log/logger";
import { getLog, resetLog } from "../src/log/logstore";
import { resetBoot } from "../src/log/boot";
import { useSelection } from "../src/selection/useSelection";
import { getAppState, resetAppStore, setAppState } from "../src/state/appstore";
import { bootStores } from "../src/state/boot";
import { HistoryProvider, type HistoryApi } from "../src/state/HistoryProvider";
import { loadHistory } from "../src/state/historystore";
import { uninstallTabLog } from "../src/state/statelog";
import { clearApiKey, loadApiKey, saveApiKey } from "../src/svg/keystore";
import { useToast, type ToastApi } from "../src/ui/useToast";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { FakeStorage } from "./helpers/fakestorage";
import { mountHistory, type HistoryHarness } from "./helpers/historymount";
import { PLAIN_SECRET, input } from "./helpers/logfix";
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

// The batch run decodes and splits real pixels; here the pixels are replaced, never the run itself.
const split = vi.hoisted(() => ({ gate: null as Promise<void> | null }));
vi.mock("../src/lib/dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/dom")>();
  return { ...actual, loadImageFile: vi.fn(async () => ({ naturalWidth: 10, naturalHeight: 10 })) };
});
vi.mock("../src/lib/batchsplit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/batchsplit")>();
  return { ...actual, splitSheet: vi.fn(async () => { await split.gate; return [new Blob(["icon"])]; }) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const kinds = () => getLog().entries.map((e) => `${e.feature}.${e.action}`);
const entriesOf = (kind: string) => getLog().entries.filter((e) => `${e.feature}.${e.action}` === kind);
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

beforeEach(() => {
  vi.stubGlobal("localStorage", new FakeStorage());
  stored.clear();
  split.gate = null;
  resetLog();
  resetBoot();
  uninstallTabLog();
  resetAppStore();
});

afterEach(() => vi.unstubAllGlobals());

describe("the tab", () => {
  it("records a switch with where it came from and where it went", () => {
    bootStores();
    setAppState({ tab: "batch" });
    setAppState({ tab: "generateSvg" });
    expect(entriesOf("app.tab.open").map((e) => e.data)).toEqual([{ from: "sheets", to: "batch" }, { from: "batch", to: "generateSvg" }]);
  });

  it("says nothing when the tab did not change, or when something else did", () => {
    bootStores();
    setAppState({ tab: "batch" });
    setAppState({ tab: "batch" });
    setAppState({ sheets: { padding: 7, size: 256, transparent: true } });
    expect(entriesOf("app.tab.open")).toHaveLength(1);
  });

  it("does not record the tab the last session restored as if the user had opened it", () => {
    bootStores();
    expect(getAppState().tab).toBe("sheets");
    expect(entriesOf("app.tab.open")).toHaveLength(0);
  });

  it("listens once however many times the app boots", () => {
    bootStores();
    bootStores();
    bootStores();
    setAppState({ tab: "batch" });
    expect(entriesOf("app.tab.open")).toHaveLength(1);
  });
});

describe("the undo/redo history", () => {
  let h: HistoryHarness;
  let api: HistoryApi;
  const SHEETS_6 = { padding: 6, size: 512, transparent: false };
  const SHEETS_12 = { padding: 12, size: 512, transparent: false };
  beforeEach(() => { h = mountHistory((a) => { api = a; }); });
  afterEach(() => h.unmount());

  const pushPadding = () => {
    act(() => setAppState({ sheets: SHEETS_12 }));
    act(() => api.push({ type: "sheets", label: "Padding 12%", origin: "sheets", ids: ["padding"], before: SHEETS_6, after: SHEETS_12 }));
  };

  it("records an action by its label, kind, origin and the COUNT of what it touched — never the id list", () => {
    act(() => api.push({ type: "checked", label: "Select 3 sources", origin: "generateSvg", ids: ["a", "b", "c"], before: [], after: ["a", "b", "c"] }));
    const [e] = entriesOf("history.entry.push");
    expect(e).toMatchObject({ level: "info", message: "Select 3 sources", data: { type: "checked", origin: "generateSvg", count: 3, gesture: false } });
    expect(e.ids.hist).toBe(loadHistory().entries[0].id);
    expect(JSON.stringify(e)).not.toContain("\"b\"");
  });

  it("folds the ticks of one gesture into one entry", () => {
    for (const padding of [8, 9, 10]) {
      act(() => api.pushGesture({ type: "sheets", label: `Padding ${padding}%`, origin: "sheets", ids: ["padding"], before: SHEETS_6, after: { ...SHEETS_6, padding } }));
    }
    const pushes = entriesOf("history.entry.push");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ data: { gesture: true }, repeat: 3 });
  });

  it("records undo and redo with the entry they applied", async () => {
    pushPadding();
    await h.click("[data-testid='hist-undo']");
    await h.click("[data-testid='hist-redo']");
    const undo = entriesOf("history.undo");
    const redo = entriesOf("history.redo");
    expect(undo).toHaveLength(1);
    expect(redo).toHaveLength(1);
    expect(undo[0]).toMatchObject({ level: "info", data: { type: "sheets", origin: "sheets" } });
    expect(undo[0].ids.hist).toBe(loadHistory().entries[0].id);
    expect(redo[0].ids.hist).toBe(undo[0].ids.hist);
  });

  it("records a failed apply as an error, and not as an undo", async () => {
    act(() => api.push({ type: "from-the-future", label: "Strange edit", origin: "sheets", ids: ["x"], before: 1, after: 2 }));
    await h.click("[data-testid='hist-undo']");
    expect(entriesOf("history.apply.failed")).toHaveLength(1);
    expect(entriesOf("history.apply.failed")[0]).toMatchObject({ level: "error", data: { type: "from-the-future" } });
    expect(entriesOf("history.undo")).toHaveLength(0);
  });

  it("records nothing for an undo that had nothing to undo", async () => {
    await act(async () => { api.undo(); });
    expect(kinds()).toEqual([]);
  });
});

describe("every toast is mirrored once, with its own text and a level from err (L-4)", () => {
  async function mountProbe<T>(node: React.ReactNode, read: () => T): Promise<{ read: () => T; unmount: () => Promise<void> }> {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: Root = createRoot(host);
    await act(async () => { root.render(node); });
    return { read, unmount: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
  }

  it("sheets: the toast hook says, and the log hears the same words", async () => {
    const out: { current: ToastApi | null } = { current: null };
    function Probe() { out.current = useToast("sheets"); return null; }
    const p = await mountProbe(<Probe />, () => out.current as ToastApi);
    await act(async () => { p.read().say("3 icons downloaded"); });
    await act(async () => { p.read().say("Export failed", true); });
    expect(getLog().entries.map((e) => [e.feature, e.action, e.level, e.message])).toEqual([
      ["sheets", "status", "info", "3 icons downloaded"],
      ["sheets", "status", "error", "Export failed"],
    ]);
    expect(p.read().toast).toMatchObject({ msg: "Export failed", err: true });
    await p.unmount();
  });

  describe("batch: the say and the four direct writes", () => {
    const api: { current: ReturnType<typeof useBatch> | null } = { current: null };
    const b = () => api.current as ReturnType<typeof useBatch>;
    let probe: Awaited<ReturnType<typeof mountProbe>>;

    function Probe() {
      api.current = useBatch();
      return null;
    }

    async function start(root?: FakeDir): Promise<void> {
      if (root) stored.set("Default", { source: root });
      probe = await mountProbe(<Probe />, () => api.current);
      await settle();
    }

    afterEach(async () => { await probe.unmount(); });

    const aiRoot = (): FakeDir => {
      const root = new FakeDir("split_root");
      const arch = new FakeDir("architecture");
      arch.children.set("fog.png", new FakeFile("fog.png", 1, 3000, "a"));
      arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 1, 3100, "b"));
      root.children.set("architecture", arch);
      return root;
    };

    /** The toast and the single status entry it must have produced, compared. */
    const lastStatus = () => entriesOf("batch.status").at(-1);
    const sameAsToast = () => {
      expect(lastStatus()?.message).toBe(b().s.toast?.msg);
      expect(lastStatus()?.level).toBe(b().s.toast?.err ? "error" : "info");
    };

    it("says for: choosing a folder without the picker (say)", async () => {
      await start();
      await act(async () => { await b().chooseRoot(); });
      expect(entriesOf("batch.status")).toHaveLength(1);
      expect(lastStatus()).toMatchObject({ level: "error", message: "Folder picking needs Chrome or Edge — or was cancelled" });
      sameAsToast();
    });

    it("says for: saving a preset (direct write 1)", async () => {
      await start();
      await act(async () => { await b().savePreset("Work"); });
      expect(entriesOf("batch.status")).toHaveLength(1);
      expect(lastStatus()).toMatchObject({ level: "info", message: "Preset “Work” saved" });
      sameAsToast();
    });

    it("says for: deleting a preset (direct write 2)", async () => {
      await start();
      await act(async () => { b().deletePreset("Ghost"); });
      expect(entriesOf("batch.status")).toHaveLength(1);
      expect(lastStatus()).toMatchObject({ level: "info", message: "Preset “Ghost” deleted" });
      sameAsToast();
    });

    it("says for: loading a preset that is not there (say, error)", async () => {
      await start();
      await act(async () => { await b().loadPreset("Nope"); });
      expect(entriesOf("batch.status")).toHaveLength(1);
      expect(lastStatus()).toMatchObject({ level: "error", message: "Preset “Nope” not found" });
      sameAsToast();
    });

    it("says for: splitting with nothing selected (direct write 3)", async () => {
      await start(new FakeDir("empty_root"));
      await act(async () => { b().run(); });
      await settle();
      expect(entriesOf("batch.status")).toHaveLength(1);
      expect(lastStatus()).toMatchObject({ level: "error", message: "Nothing selected" });
      sameAsToast();
    });

    it("says for: a finished run (direct write 4) and brackets it with start and done", async () => {
      await start(aiRoot());
      await act(async () => { b().refresh(); });
      await settle();
      const before = entriesOf("batch.status").length;
      await act(async () => { b().run(); });
      await settle();
      await settle();
      const fresh = entriesOf("batch.status").slice(before);
      expect(fresh).toHaveLength(1);
      expect(fresh[0]).toMatchObject({ level: "info", message: "Processed 1, skipped 0, failed 0" });
      sameAsToast();
      expect(entriesOf("batch.process.start")[0].data).toEqual({ selected: 1 });
      expect(entriesOf("batch.process.done")[0]).toMatchObject({ level: "info", data: { saved: 1, skipped: 0, failed: 0 } });
      expect(kinds().indexOf("batch.process.start")).toBeLessThan(kinds().indexOf("batch.process.done"));
    });

    it("records Stop when the user stops a run, and the run's outcome after it", async () => {
      await start(aiRoot());
      await act(async () => { b().refresh(); });
      await settle();
      let release: () => void = () => undefined;
      split.gate = new Promise<void>((r) => { release = r; });
      await act(async () => { b().run(); });
      await settle();
      await act(async () => { b().cancel(); });
      expect(entriesOf("batch.process.stop")).toHaveLength(1);
      expect(entriesOf("batch.process.stop")[0].level).toBe("warn");
      release();
      await settle();
      await settle();
      expect(entriesOf("batch.process.done")).toHaveLength(1);
    });

    it("has a default preset the log never hears about as a change", async () => {
      await start();
      expect(b().s.preset).toEqual(defaultPreset("Default"));
      expect(entriesOf("batch.status")).toHaveLength(0);
    });
  });

  describe("selection: the say and the two direct writes", () => {
    const api: { current: ReturnType<typeof useSelection> | null } = { current: null };
    const s = () => api.current as ReturnType<typeof useSelection>;
    let probe: Awaited<ReturnType<typeof mountProbe>>;

    function Probe() {
      api.current = useSelection();
      return null;
    }

    const pairRoot = (): FakeDir => {
      const root = new FakeDir("test_processing");
      const camp = new FakeDir("camp");
      camp.children.set("a.png", new FakeFile("a.png", 5, 111, "x"));
      camp.children.set("a_AI.png", new FakeFile("a_AI.png", 9, 222, "y"));
      root.children.set("camp", camp);
      return root;
    };

    async function start(): Promise<void> {
      probe = await mountProbe(<HistoryProvider><Probe /></HistoryProvider>, () => api.current);
      await settle();
    }

    afterEach(async () => {
      await probe.unmount();
      Reflect.deleteProperty(window, "showDirectoryPicker");
    });

    const lastStatus = () => entriesOf("selection.status").at(-1);

    it("says for: choosing a folder when the picker is cancelled (say)", async () => {
      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = () => Promise.reject(new Error("cancelled"));
      await start();
      await act(async () => { await s().chooseRoot(); });
      expect(entriesOf("selection.status")).toHaveLength(1);
      expect(lastStatus()).toMatchObject({ level: "error", message: "Folder picking needs Chrome or Edge — or was cancelled" });
      expect(s().s.toast?.msg).toBe(lastStatus()?.message);
    });

    it("says for: a bulk decision that changed something (direct write 5) and for one that changed nothing (direct write 6)", async () => {
      (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = () => Promise.resolve(pairRoot());
      await start();
      await act(async () => { await s().chooseRoot(); });
      await settle();
      const id = s().s.pairs[0].pairId;
      const before = entriesOf("selection.status").length;
      await act(async () => { s().decideBulk([id], "approved"); });
      await settle();
      const applied = entriesOf("selection.status").slice(before);
      expect(applied).toHaveLength(1);
      expect(applied[0].level).toBe("info");
      expect(s().s.toast?.msg).toBe(applied[0].message);
      await act(async () => { s().decideBulk(["no-such-pair"], "approved"); });
      await settle();
      const nothing = entriesOf("selection.status").slice(before + 1);
      expect(nothing).toHaveLength(1);
      expect(nothing[0].level).toBe("error");
      expect(s().s.toast?.msg).toBe(nothing[0].message);
    });
  });
});

describe("the provider key", () => {
  it("is registered when the key store saves or loads it, so a key of NO known shape is masked", async () => {
    await saveApiKey(PLAIN_SECRET);
    log(input({ message: `oops ${PLAIN_SECRET}` }));
    expect(JSON.stringify(getLog().entries)).not.toContain(PLAIN_SECRET);
    resetLog();
    expect(await loadApiKey()).toBe(PLAIN_SECRET); // a new session: the registry starts empty, loading re-fills it
    log(input({ message: `again ${PLAIN_SECRET}` }));
    expect(JSON.stringify(getLog().entries)).not.toContain(PLAIN_SECRET);
  });

  it("is forgotten when it is cleared", async () => {
    await saveApiKey(PLAIN_SECRET);
    await clearApiKey();
    log(input({ message: `after clearing ${PLAIN_SECRET}` }));
    expect(getLog().entries[0].message).toContain(PLAIN_SECRET);
  });

  it("keeps masking a key that was replaced — it may still be a live secret elsewhere", async () => {
    const other = ["another", "secret", "ValueWithNoKnownShape99"].join("-");
    await saveApiKey(PLAIN_SECRET);
    await saveApiKey(other);
    log(input({ message: `old ${PLAIN_SECRET}`, fold: "a" }));
    log(input({ message: `new ${other}`, fold: "b" }));
    expect(JSON.stringify(getLog().entries)).not.toContain(PLAIN_SECRET);
    expect(JSON.stringify(getLog().entries)).not.toContain(other);
    await clearApiKey();
  });
});
