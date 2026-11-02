// selection_ignores_registered_variants.test.tsx — a file registered as a
// VERSION of a pair must never become a review row of its own (2026-11-02).
// Reported: after "register AI sources" in Generate SVG, the same images showed
// up in Selection V2 as new pairs to review. They are that pair's history, so the
// review list keeps exactly one row per artwork — while a registered image that
// really belongs to nobody stays visible.
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pairId, pairEntries, type ReviewPair } from "../src/lib/pairing";
import { parsePairMeta, serializePairMeta } from "../src/lib/pairmeta";
import { recordedVariants, variantOwner, withoutRecordedVariants } from "../src/lib/imageartifact";
import { runRegisterImagesFor } from "../src/svg/registerimages";
import { toRow } from "../src/svg/rowmodel";
import SelectionV2Panel from "../src/selectionv2/SelectionV2Panel";
import { HistoryProvider } from "../src/state/HistoryProvider";
import { usePrefsAutosave } from "../src/state/usePrefsAutosave";
import { clearKnownRoots } from "../src/lib/knownroots";
import { resetAppStore } from "../src/state/appstore";
import type { FileEntry } from "../src/lib/scan";
import { pairMetaFor, svgSource } from "./helpers/svgpair";
import { FakeDir, FakeFile } from "./helpers/fakefs";
import { dropDb } from "./helpers/idb";
import { settle as quietSettle } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FOG = pairId("architecture", "fog", "");
const COURT = pairId("architecture", "court", "");
/** The phantom pair the registered variant must NOT become. */
const FOG_VARIANT = pairId("architecture", "fog", "_02");

/** A file whose bytes really start like a PNG, as the register pass requires. */
function pngFile(name: string, mtime = 3200): FakeFile {
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x20, 0x20, 0x20, 0x20]);
  const file = new FakeFile(name, bytes.length, mtime, "png");
  file.data = new Blob([bytes]);
  return file;
}

/**
 * `architecture/` with the fog pair (approved), an unrelated court pair, and the
 * dropped-in `fog_AI_02.png` the user registers — the exact shape that leaked.
 */
function rootWithVariant(): FakeDir {
  const root = new FakeDir("split_root");
  const arch = new FakeDir("architecture");
  arch.children.set("fog.png", pngFile("fog.png", 3000));
  arch.children.set("fog_AI.png", pngFile("fog_AI.png", 3100));
  arch.children.set("fog_AI_02.png", pngFile("fog_AI_02.png", 4000)); // the registered variant
  arch.children.set("court.png", pngFile("court.png", 2000));
  arch.children.set("court_AI.png", pngFile("court_AI.png", 2100));
  const source = svgSource(FOG, { name: "fog_AI.png" });
  arch.children.set("fog_AI.svg.json", new FakeFile("fog_AI.svg.json", 10, 3300, serializePairMeta(pairMetaFor(source))));
  root.children.set("architecture", arch);
  const recs = [
    { pair_id: FOG, source: "architecture/fog.png", ai_result: "architecture/fog_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" },
    { pair_id: COURT, source: "architecture/court.png", ai_result: "architecture/court_AI.png", decision: "approved", reviewed_at: "2026-10-01T09:00:00.000Z" },
  ];
  root.children.set("review-decisions.json", new FakeFile("review-decisions.json", 10, 10, JSON.stringify({ records: recs })));
  return root;
}

/** The pair file as it is on disk now. */
function pairMetaOnDisk(root: FakeDir) {
  const file = (root.children.get("architecture") as FakeDir).children.get("fog_AI.svg.json") as FakeFile;
  const parsed = parsePairMeta(file.text);
  if (!parsed.ok) throw new Error("the pair file no longer parses");
  return parsed.meta;
}

/** The context the panel's "Register AI sources" action builds. */
function ctxFor(root: FakeDir) {
  const source = svgSource(FOG, { name: "fog_AI.png" });
  const row = toRow(source, pairMetaOnDisk(root), false);
  const said: string[] = [];
  const ctx = {
    refs: { root: { current: root }, metas: new Map(), abort: { current: null }, queue: { current: [] }, key: { current: null } },
    rows: [row],
    say: (msg: string) => { said.push(msg); },
    setRowsFn: (fn: (rows: typeof row[]) => typeof row[]) => { ctx.rows = fn(ctx.rows); },
  };
  return { ctx, said };
}

/** Mounts the real Selection V2 panel on this folder and reads its row ids. */
async function selectionRows(root: FakeDir): Promise<string[]> {
  (window as unknown as { showDirectoryPicker?: () => Promise<unknown> }).showDirectoryPicker = async () => root;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const ui: Root = createRoot(el);
  await act(async () => { ui.render(<HistoryProvider><PrefsHost><SelectionV2Panel /></PrefsHost></HistoryProvider>); });
  await act(async () => { (el.querySelector("[data-testid='v2-open-folder']") as HTMLElement).click(); });
  await quietSettle();
  const ids = [...el.querySelectorAll("[data-testid^='v2-row-']")]
    .map((r) => r.getAttribute("data-testid")!.slice("v2-row-".length));
  await act(async () => { ui.unmount(); });
  el.remove();
  return ids;
}

function PrefsHost({ children }: { children: ReactNode }) {
  usePrefsAutosave();
  return <>{children}</>;
}

describe("a file registered as one pair's AI-source version", () => {
  it("is named by the pair file, case-insensitively, and owned by that pair alone", async () => {
    const root = rootWithVariant();
    await runRegisterImages(root);
    const meta = pairMetaOnDisk(root);
    expect(meta.imageVersions.map((v) => v.file)).toEqual(["architecture/fog_AI_02.png"]);
    const index = recordedVariants([meta]);
    expect(index.get("architecture/fog_ai_02.png")).toBe(FOG); // case-insensitively
    expect(variantOwner("architecture/fog_AI_02.png", index)).toBe(FOG);
    expect(variantOwner("coastal/fog_AI_02.png", index)).toBeNull(); // another folder's file
  });

  it("drops the pair it created and keeps every real one", async () => {
    const root = rootWithVariant();
    await runRegisterImages(root);
    const entries = entriesOf(root);
    const pairs = pairEntries(entries);
    expect(pairs.map((p) => p.pairId)).toContain(FOG_VARIANT); // before: a row of its own
    const meta = pairMetaOnDisk(root);
    const kept = withoutRecordedVariants(pairs, [meta]);
    expect(kept.map((p) => p.pairId).sort()).toEqual([FOG, COURT].sort());
    // a pair that records its OWN face as a version is still that artwork
    const fog: ReviewPair[] = pairs.filter((p) => p.pairId === FOG);
    const own = { ...meta, imageVersions: [{ ...meta.imageVersions[0], file: "architecture/fog_AI.png" }] };
    expect(withoutRecordedVariants(fog, [own])).toHaveLength(1);
  });

  it("never shows up as a Selection V2 row", async () => {
    const root = rootWithVariant();
    const { ctx, said } = ctxFor(root);
    await act(async () => { await runRegisterImagesFor(ctx as never, [FOG]); });
    expect(said.at(-1)).toContain("1 existing AI source registered");
    const ids = await selectionRows(root);
    expect(ids).not.toContain(FOG_VARIANT);
    expect([...ids].sort()).toEqual([COURT, FOG].sort());
  });
});

/** The folder as the scan sees it: every file, with its folder-relative path. */
function entriesOf(dir: FakeDir, parent = ""): FileEntry[] {
  return [...dir.children].flatMap(([name, child]) => {
    const relPath = parent === "" ? name : `${parent}/${name}`;
    if (child instanceof FakeDir) return entriesOf(child, relPath);
    return [{ name, relPath, dirPath: parent, size: child.size, mtime: child.mtime, error: null }];
  });
}

/** Registers through the real action, so the test never hand-writes the record. */
async function runRegisterImages(root: FakeDir): Promise<void> {
  await act(async () => { await runRegisterImagesFor(ctxFor(root).ctx as never, [FOG]); });
}

beforeEach(async () => {
  localStorage.clear();
  resetAppStore();
  clearKnownRoots();
  await dropDb();
  vi.unstubAllGlobals();
});
