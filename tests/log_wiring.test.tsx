// log_wiring.test.tsx — the app really writes to the global log (feature §3):
// state changes through the undo timeline, discovery scans, API-key saves and
// the run event sink all reach the store, with ids and without secrets.
// Ported 2026-10-05: the scan assertions match THIS branch's Discovery (a
// problem is a status on the row, so the summary counts `problems`, not
// `missing`) and the refs carry the deterministic-scan ticket and snapshot key.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { SCAN_IDLE } from "../src/lib/scanseq";
import { getLogState, resetLogStore } from "../src/log/logstore";
import { scanSources } from "../src/svg/scan";
import { withRunLog } from "../src/svg/runlog";
import { clearApiKey, saveApiKey } from "../src/svg/keystore";
import type { RunEvent } from "../src/svg/runtypes";
import { HistoryProvider, useHistory } from "../src/state/HistoryProvider";
import type { SvgRefs } from "../src/svg/types";
import { FakeDir, FakeFile } from "./helpers/fakefs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Assembled from parts so this test file stays free of a key literal. */
const KEY = ["rq", "live", "QwErTy7UiOpAsDfGh4JkLzXcVbNm2"].join("_");

const entries = () => getLogState().entries;
const actions = () => entries().map((e) => `${e.feature}.${e.action}`);
const text = () => entries().map((e) => `${e.detail ?? ""} ${JSON.stringify(e.data)} ${JSON.stringify(e.ids)}`).join("\n");

beforeEach(() => {
  localStorage.clear();
  resetLogStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the undo timeline is logged", () => {
  let host: HTMLDivElement;
  let ui: Root;
  let push: () => void;
  let undo: () => void;

  afterEach(() => {
    act(() => ui.unmount());
    host.remove();
  });

  /** A probe that uses the real provider, so the wiring is exercised. */
  function Probe() {
    const h = useHistory();
    push = () => h.push({ type: "checked", label: "Select 2 sources", origin: "generateSvg", ids: ["pair_1", "pair_2"], before: {}, after: {} });
    undo = h.undo;
    return null;
  }

  it("records a pushed edit with its label and count", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    ui = createRoot(host);
    await act(async () => { ui.render(<HistoryProvider><Probe /></HistoryProvider>); });

    await act(async () => { push(); });

    const last = entries()[entries().length - 1];
    expect(last.feature).toBe("history");
    expect(last.action).toBe("push");
    expect(last.detail).toBe("Select 2 sources");
    expect(last.data).toMatchObject({ type: "checked", ids: 2 });
    expect(last.level).toBe("debug"); // a normal edit is not a warning
  });

  it("records an undo attempt and, when it cannot be applied, the failure", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    ui = createRoot(host);
    await act(async () => { ui.render(<HistoryProvider><Probe /></HistoryProvider>); });
    await act(async () => { push(); });

    await act(async () => { undo(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(actions()).toContain("history.undo");
    expect(actions()).toContain("history.apply-failed");
    expect(entries()[entries().length - 1].level).toBe("error");
  });
});

describe("discovery is logged", () => {
  /** One approved pair, its AI image present. */
  async function root(): Promise<FakeDir> {
    const dir = new FakeDir("split_root");
    const arch = new FakeDir("architecture");
    arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
    arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
    dir.children.set("architecture", arch);
    const id = pairId("architecture", "fog", "");
    dir.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
      records: [{ pair_id: id, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-05T09:00:00.000Z" }],
    })));
    return dir;
  }

  /** The refs a scan writes through: the ticket and the snapshot key included. */
  function refs(dir: FakeDir): SvgRefs {
    return {
      root: { current: dir }, metas: new Map(), abort: { current: null }, queue: { current: [] }, key: { current: null },
      scanKey: { current: null }, seq: { current: SCAN_IDLE },
    };
  }

  const setters = {
    setRootName: () => undefined, setRows: () => undefined, setDiscovery: () => undefined,
    setBusy: () => undefined, setRootToken: () => undefined, say: () => undefined,
  };

  it("records what a scan found, so an empty list is never a mystery", async () => {
    await scanSources(refs(await root()), setters);

    const scan = entries().find((e) => e.action === "scan");
    expect(scan).toBeDefined();
    expect(scan?.data).toMatchObject({ eligible: 1, problems: 0, unreadable: 0 });
  });

  it("names a corrupt decision file as a warning, not a failure", async () => {
    const dir = new FakeDir("split_root");
    dir.children.set("review-decisions.json", new FakeFile("review-decisions.json", 5, 5, "{not json"));
    await scanSources(refs(dir), setters);

    const warn = entries().find((e) => e.level === "warn");
    expect(warn?.detail).toContain("review-decisions.json");
  });
});

describe("API-key actions are logged as masks", () => {
  it("records a save with the mask and never the key", async () => {
    await saveApiKey(KEY);

    const saved = entries().find((e) => e.action === "key-saved");
    expect(saved).toBeDefined();
    expect(saved?.detail ?? "").toContain("rq_live_");
    expect(saved?.data).toHaveProperty("persisted");
    expect(text()).not.toContain(KEY);
  });

  it("records clearing the key", async () => {
    await saveApiKey(KEY);
    await clearApiKey();
    expect(actions()).toContain("svg.key-cleared");
    expect(text()).not.toContain(KEY);
  });
});

describe("the run event sink feeds the log", () => {
  it("maps a run event to the log while still handing it to the live UI", () => {
    const seen: RunEvent[] = [];
    const sink = withRunLog((event: RunEvent) => seen.push(event));
    const event: RunEvent = { kind: "run-start", batches: 3, perRequest: 4 };

    sink(event);

    expect(seen).toEqual([event]); // the rows still update first
    expect(actions()).toEqual(["svg.run-start"]);
    expect(entries()[0].data).toMatchObject({ batches: 3, perRequest: 4 });
  });
});
