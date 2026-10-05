// batch_presets.test.tsx — the Batch tab's preset actions and its status toast,
// driven through the REAL useBatch hook (RULE 8). Written BEFORE the preset
// actions moved to batch/usePresetActions.ts (P0 of the 2026-10-01 design):
// until now nothing imported useBatch, so the extraction — and the log tap that
// follows it — would have been unobserved.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLastName, loadPresets, saveLastName, savePresets } from "../src/batch/store";
import { useBatch } from "../src/batch/useBatch";
import { defaultPreset } from "../src/lib/presets";
import { FakeDir, FakeFile } from "./helpers/fakefs";
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let ui: Root;
const api: { current: ReturnType<typeof useBatch> | null } = { current: null };
const b = () => api.current as ReturnType<typeof useBatch>;
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

function Probe() {
  api.current = useBatch();
  return null;
}

async function mount(): Promise<void> {
  host = document.createElement("div");
  document.body.appendChild(host);
  ui = createRoot(host);
  await act(async () => { ui.render(<Probe />); });
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  stored.clear();
});

afterEach(async () => {
  await act(async () => { ui.unmount(); });
  host.remove();
  vi.useRealTimers();
});

describe("preset actions", () => {
  it("saves the current form under a name, remembers it and says so", async () => {
    await mount();
    await act(async () => { b().setPreset({ selection: "all" }); });
    await act(async () => { await b().savePreset("Work"); });
    expect(loadPresets().map((p) => p.name)).toEqual(["Work"]);
    expect(loadPresets()[0].selection).toBe("all");
    expect(loadLastName()).toBe("Work");
    expect(b().s.presetNames).toEqual(["Work"]);
    expect(b().s.preset.name).toBe("Work");
    expect(b().s.toast).toMatchObject({ msg: "Preset “Work” saved" });
    expect(b().s.toast?.err).toBeFalsy();
  });

  it("replaces a preset saved under the same name instead of listing it twice", async () => {
    await mount();
    await act(async () => { await b().savePreset("Work"); });
    await act(async () => { b().setPreset({ selection: "none" }); });
    await act(async () => { await b().savePreset("Work"); });
    expect(loadPresets()).toHaveLength(1);
    expect(loadPresets()[0].selection).toBe("none");
    expect(b().s.presetNames).toEqual(["Work"]);
  });

  it("loads a saved preset into the form and remembers it as the last used", async () => {
    await mount();
    await act(async () => { b().setPreset({ selection: "all" }); });
    await act(async () => { await b().savePreset("Work"); });
    await act(async () => { b().setPreset({ selection: "none" }); });
    expect(b().s.preset.selection).toBe("none");
    saveLastName("elsewhere");
    await act(async () => { await b().loadPreset("Work"); });
    expect(b().s.preset).toMatchObject({ name: "Work", selection: "all" });
    expect(loadLastName()).toBe("Work");
  });

  it("reports an unknown preset as an error and changes nothing", async () => {
    await mount();
    await act(async () => { await b().loadPreset("Nope"); });
    expect(b().s.toast).toMatchObject({ msg: "Preset “Nope” not found", err: true });
    expect(b().s.preset.name).toBe("Default");
    expect(loadLastName()).toBeNull();
  });

  it("deletes a preset from storage and from the list, and says so", async () => {
    await mount();
    await act(async () => { await b().savePreset("Work"); });
    await act(async () => { await b().savePreset("Home"); });
    await act(async () => { b().deletePreset("Work"); });
    expect(loadPresets().map((p) => p.name)).toEqual(["Home"]);
    expect(b().s.presetNames).toEqual(["Home"]);
    expect(b().s.toast).toMatchObject({ msg: "Preset “Work” deleted" });
  });

  it("patches the form without touching what was not named", async () => {
    await mount();
    await act(async () => { b().setPreset({ destMode: "custom" }); });
    expect(b().s.preset).toMatchObject({ destMode: "custom", selection: "remember", name: "Default" });
  });
});

describe("opening the tab", () => {
  it("restores the last-used preset and the list of names", async () => {
    savePresets([{ ...defaultPreset("Old"), selection: "none" }, defaultPreset("Other")]);
    saveLastName("Old");
    await mount();
    expect(b().s.preset).toMatchObject({ name: "Old", selection: "none" });
    expect(b().s.presetNames).toEqual(["Old", "Other"]);
  });

  it("falls back to the default preset when the stored list is unreadable", async () => {
    localStorage.setItem("iconSplitter.presets.v1", "{not json");
    await mount();
    expect(b().s.preset.name).toBe("Default");
    expect(b().s.presetNames).toEqual([]);
  });
});

describe("the status toast", () => {
  it("says when folder picking is unavailable or was cancelled", async () => {
    await mount();
    await act(async () => { await b().chooseRoot(); });
    expect(b().s.toast).toMatchObject({ msg: "Folder picking needs Chrome or Edge — or was cancelled", err: true });
  });

  it("clears itself after four seconds", async () => {
    await mount();
    vi.useFakeTimers();
    await act(async () => { b().deletePreset("Ghost"); });
    expect(b().s.toast).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(3999); });
    expect(b().s.toast).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(b().s.toast).toBeNull();
  });

  it("reports how many AI images a rescan found", async () => {
    const root = new FakeDir("split_root");
    const arch = new FakeDir("architecture");
    arch.children.set("fog.png", new FakeFile("fog.png", 12, 3000, "a"));
    arch.children.set("fog_AI.png", new FakeFile("fog_AI.png", 20, 3100, "b"));
    root.children.set("architecture", arch);
    stored.set("Default", { source: root });
    await mount();
    await act(async () => { b().refresh(); });
    await settle();
    expect(b().s.toast).toMatchObject({ msg: "Found 1 AI image" });
    expect(b().s.rows).toHaveLength(1);
  });
});
