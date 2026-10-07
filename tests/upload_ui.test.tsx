// upload_ui.test.tsx — the SVG-to-upload tab as the USER meets it (RULE 8):
// the real panel, the real scan, the real job and the real commit over a fake
// folder. Everything drives the wiring: a scan lists the approved pair, the
// cached metadata is accepted without any AI call, the confirm dialog shows
// the redacted request only when the paid call is really needed, Export writes
// the whole package (SVG + JPEG + export.json LAST) into the pair's export/
// folder and the row turns green, "Apply settings to selected" is ONE undoable
// entry whose undo restores the previous overrides, and the metadata editor
// re-validates live. A regression in any link fails the test that names it.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pairId } from "../src/lib/pairing";
import { serializePairMeta } from "../src/lib/pairmeta";
import UploadPanel from "../src/upload/UploadPanel";
import { useUpload } from "../src/upload/useUpload";
import { resetAppStore } from "../src/state/appstore";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { MANDATORY_TAGS } from "../src/lib/upmeta";
import { fakeJpeg } from "./helpers/fakejpeg";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// No IndexedDB in this DOM: an in-memory handle store keeps the boot real.
const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

// happy-dom cannot rasterize: the REAL encode/verify pipeline runs against a
// structurally valid fake JPEG (the composite mock precedent, svg_queue_ui).
vi.mock("../src/lib/upraster", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/upraster")>();
  return {
    ...actual,
    browserRasterize: vi.fn(async () => new Uint8Array(fakeJpeg(3886, 3886))),
    browserDecode: vi.fn(async () => true),
  };
});

vi.mock("../src/lib/upsvgo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/upsvgo")>();
  return {
    ...actual,
    browserPixelDeps: vi.fn(() => ({ renderPixels: async () => new Uint8Array(256 * 256 * 4).fill(120) })),
  };
});

const w = window as unknown as { showDirectoryPicker?: unknown; fetch?: unknown };
w.showDirectoryPicker = () => Promise.reject(new Error("no picker"));
w.fetch = () => Promise.reject(new Error("the AI must not be called in this test"));

const DIR = "pairs";
const ID = pairId(DIR, "icon-a", "");
const SOURCE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M 4 20 L 12 4 L 20 20 Z" fill="none" stroke="#101010" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const FINGERPRINT = `${SOURCE_SVG.length}:3300`;
const META = {
  title: "Forward Motion and Fast Growth. The Vector Icon of Speed",
  description: "Arrow symbolising fast upward movement and success",
  tags: [...MANDATORY_TAGS, ...Array.from({ length: 33 }, (_, i) => `concept-${i}`)],
};

const tick = () => new Promise((r) => setTimeout(r, 0));
let host: HTMLDivElement;
let ui: Root;
let picked: FakeDir;

const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;
const txt = (sel: string) => q(sel)?.textContent ?? "";

/** React tracks input values, so the native setter must be used to change one. */
async function type(sel: string, value: string): Promise<void> {
  await act(async () => {
    const el = q(sel) as HTMLInputElement;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function makeRoot(): FakeDir {
  const root = new FakeDir("split_root");
  const folder = new FakeDir(DIR);
  folder.children.set("icon-a_AI.png", new FakeFile("icon-a_AI.png", 20, 3100, "ai"));
  folder.children.set("icon-a_AI_v1.svg", new FakeFile("icon-a_AI_v1.svg", SOURCE_SVG.length, 3300, SOURCE_SVG));
  folder.children.set("icon-a_AI.svg.json", new FakeFile("icon-a_AI.svg.json", 10, 3300,
    serializePairMeta(pairFile(DIR, "icon-a_AI.png", {
      id: ID, decision: "approved", preferred: 1,
      versions: [svgVersion(`${DIR}/icon-a_AI_v1.svg`, { version: 1, review: "approved" })],
    }))));
  root.children.set(DIR, folder);
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({
    records: [{ pair_id: ID, source: null, ai_result: `${DIR}/icon-a_AI.png`, decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" }],
  })));
  return root;
}


async function settle(): Promise<void> {
  await act(async () => { await tick(); });
}

async function waitFor(pred: () => boolean, what: string, budgetMs = 4000): Promise<void> {
  const until = Date.now() + budgetMs;
  await act(async () => {
    while (!pred() && Date.now() < until) await tick();
  });
  expect(pred(), `never reached: ${what}`).toBe(true);
}

function Panel() {
  return <UploadPanel u={useUpload()} />;
}

async function mount(root: FakeDir): Promise<void> {
  picked = root;
  stored.set("__upload__", { source: root });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><HistoryBar /><Panel /></HistoryProvider>);
  });
  await settle();
}

beforeEach(() => {
  resetAppStore(); // the appstore is module state: one test's checks must not leak
  localStorage.clear();
  stored.clear();
  localStorage.setItem("iconSplitter.upload.meta.v1", JSON.stringify({ cache: { [FINGERPRINT]: META } }));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  if (ui !== undefined) act(() => { ui.unmount(); });
  host.remove();
});

describe("the SVG-to-upload tab", () => {
  it("lists the approved pair with its chosen version and export state", async () => {
    await mount(makeRoot());
    await waitFor(() => q(`[data-testid="upload-row-${ID}"]`) !== null, "the row appears");
    expect(txt(`[data-testid="upload-name-${ID}"]`)).toBe("icon-a");
    expect(txt(`[data-testid="upload-version-${ID}"]`)).toContain("v1");
    expect(txt(`[data-testid="upload-export-${ID}"]`)).toBe("Not exported");
    expect(txt(`[data-testid="upload-meta-${ID}"]`)).toBe("No metadata");
  });

  it("reports approved pairs without an approved SVG as a warning, never a row", async () => {
    const root = makeRoot();
    const folder = root.children.get(DIR) as FakeDir;
    folder.children.delete("icon-a_AI_v1.svg"); // the only approved SVG is gone
    const meta = JSON.parse((folder.children.get("icon-a_AI.svg.json") as FakeFile).text);
    meta.versions = [];
    (folder.children.get("icon-a_AI.svg.json") as FakeFile).text = JSON.stringify(meta);
    await mount(root);
    await settle();
    expect(q(`[data-testid="upload-row-${ID}"]`)).toBeNull();
  });
});

describe("the export run", () => {
  it("writes the whole package and turns the row green — no AI call", async () => {
    await mount(makeRoot());
    await waitFor(() => q(`[data-testid="upload-check-${ID}"]`) !== null, "the row appears");
    await act(async () => { q(`[data-testid="upload-check-${ID}"]`)?.click(); });
    await act(async () => { q('[data-testid="upload-export"]')?.click(); });
    await waitFor(() => q('[data-testid="upload-confirm"]') !== null, "the confirm dialog opens");
    // cached metadata counts as accepted: no request preview, no AI note
    expect(q('[data-testid="upload-confirm-ai"]')).toBeNull();
    expect(q('[data-testid="upload-confirm-request"]')).toBeNull();
    await act(async () => { q('[data-testid="upload-confirm-ok"]')?.click(); });
    await waitFor(() => txt(`[data-testid="upload-export-${ID}"]`) === "Processed", "the row turns processed");
    expect(txt('[data-testid="upload-toast"]')).toContain("Exported 1 of 1 icon");
    // the package is committed: outputs + export.json LAST
    const exportDir = (picked.children.get(DIR) as FakeDir).children.get("export") as FakeDir;
    expect([...exportDir.children.keys()].sort()).toEqual(["export.json", "icon-a.jpg", "icon-a.svg"]);
    const record = JSON.parse((exportDir.children.get("export.json") as FakeFile).text);
    expect(record.v).toBe(1);
    expect(record.state).toBe("processed");
    expect(record.metadata).toEqual(META);
    expect((exportDir.children.get("icon-a.svg") as FakeFile).text).toContain("<title>");
  });

  it("shows the redacted request when the paid call is really needed", async () => {
    localStorage.setItem("iconSplitter.upload.meta.v1", JSON.stringify({ cache: {} })); // no cache
    await mount(makeRoot());
    await waitFor(() => q(`[data-testid="upload-check-${ID}"]`) !== null, "the row appears");
    await act(async () => { q(`[data-testid="upload-check-${ID}"]`)?.click(); });
    await act(async () => { q('[data-testid="upload-export"]')?.click(); });
    await waitFor(() => q('[data-testid="upload-confirm"]') !== null, "the confirm dialog opens");
    expect(q('[data-testid="upload-confirm-ai"]')).not.toBeNull();
    const preview = txt('[data-testid="upload-confirm-request"]');
    expect(preview).toContain("generateContent");
    expect(preview).toContain("[redacted]");
    // the stored key shape never appears in the dialog
    expect(preview).not.toContain("AIza");
  });
});

describe("settings: ONE undoable apply (design §5)", () => {
  it("applies the defaults to the selected icon and undo restores inheritance", async () => {
    await mount(makeRoot());
    await waitFor(() => q(`[data-testid="upload-check-${ID}"]`) !== null, "the row appears");
    await act(async () => { q(`[data-testid="upload-check-${ID}"]`)?.click(); });
    await act(async () => { q('[data-testid="upload-apply-settings"]')?.click(); });
    expect(txt('[data-testid="upload-toast"]')).toContain("Settings applied to 1 icon");
    // one history entry, undoable
    expect((q('[data-testid="hist-undo"]') as HTMLButtonElement).disabled).toBe(false);
    // the row's editor names the override
    await act(async () => { q(`[data-testid="upload-expand-${ID}"]`)?.click(); });
    expect(txt(`[data-testid="upload-meta-editor-${ID}"]`)).toContain("settings overridden");
    await act(async () => { q('[data-testid="hist-undo"]')?.click(); });
    await settle();
    expect(txt(`[data-testid="upload-meta-editor-${ID}"]`)).toContain("settings: inherited");
  });

  it("edits a global default without erasing the override", async () => {
    await mount(makeRoot());
    await waitFor(() => q(`[data-testid="upload-check-${ID}"]`) !== null, "the row appears");
    await act(async () => { q(`[data-testid="upload-check-${ID}"]`)?.click(); });
    await act(async () => { q('[data-testid="upload-apply-settings"]')?.click(); });
    await type('[data-testid="upload-default-strokePt"]', "4");
    await settle();
    await act(async () => { q(`[data-testid="upload-expand-${ID}"]`)?.click(); });
    expect(txt(`[data-testid="upload-meta-editor-${ID}"]`)).toContain("settings overridden");
  });
});

describe("the metadata editor (design §8)", () => {
  it("re-validates live: an invalid edit cannot be accepted", async () => {
    await mount(makeRoot());
    await waitFor(() => q(`[data-testid="upload-expand-${ID}"]`) !== null, "the row appears");
    await act(async () => { q(`[data-testid="upload-expand-${ID}"]`)?.click(); });
    await type(`[data-testid="upload-meta-title-${ID}"]`, "Too Short Title");
    await settle();
    expect((q(`[data-testid="upload-meta-accept-${ID}"]`) as HTMLButtonElement).disabled).toBe(true);
    expect(txt(`[data-testid="upload-meta-issues-${ID}"]`)).toContain("title");
  });

  it("accepts valid metadata and caches it for the next export", async () => {
    await mount(makeRoot());
    await waitFor(() => q(`[data-testid="upload-expand-${ID}"]`) !== null, "the row appears");
    await act(async () => { q(`[data-testid="upload-expand-${ID}"]`)?.click(); });
    await type(`[data-testid="upload-meta-title-${ID}"]`, META.title);
    await type(`[data-testid="upload-meta-desc-${ID}"]`, META.description);
    await type(`[data-testid="upload-meta-tags-${ID}"]`, META.tags.join(", "));
    await settle();
    await act(async () => { q(`[data-testid="upload-meta-accept-${ID}"]`)?.click(); });
    await waitFor(() => txt(`[data-testid="upload-meta-${ID}"]`) === "Accepted", "the chip turns accepted");
    const cache = JSON.parse(localStorage.getItem("iconSplitter.upload.meta.v1") ?? "{}");
    expect(cache.cache[FINGERPRINT]).toEqual(META);
  });
});

describe("the provider card (RULE 20)", () => {
  it("masks the key and never shows its value", async () => {
    await mount(makeRoot());
    await waitFor(() => q('[data-testid="upload-provider-toggle"]') !== null, "the card appears");
    await act(async () => { q('[data-testid="upload-provider-toggle"]')?.click(); });
    await type('[data-testid="upload-key-input"]', "AIza-test-key-0123456789abcdefg");
    await act(async () => { q('[data-testid="upload-key-save"]')?.click(); });
    await waitFor(() => txt('[data-testid="upload-provider-toggle"]').includes("•"), "the key is masked");
    expect(host.textContent ?? "").not.toContain("AIza-test-key");
  });
});

describe("the undo path survives an unmounted panel (RULE 12)", () => {
  it("applies an uploadSettings entry through the durable store", async () => {
    const { applyUploadSettings } = await import("../src/upload/undoable");
    const ok = applyUploadSettings({ overrides: { [ID]: { strokePt: 4 } } });
    expect(ok).toBe(true);
    const storedOverrides = JSON.parse(localStorage.getItem("iconSplitter.upload.overrides.v1") ?? "{}");
    expect(storedOverrides.overrides[ID]).toEqual({ strokePt: 4 });
    // undo restores
    expect(applyUploadSettings({ overrides: { [ID]: null } })).toBe(true);
    const after = JSON.parse(localStorage.getItem("iconSplitter.upload.overrides.v1") ?? "{}");
    expect(after.overrides[ID]).toBeUndefined();
  });
});
