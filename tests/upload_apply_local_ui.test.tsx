// Real upload panel: local batch snapshots, live globals, persistence and history.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots } from "../src/lib/knownroots";
import { resetAppStore } from "../src/state/appstore";
import { forgetRestoreNote } from "../src/upload/jobstore";
import { resetRowBadges } from "../src/upload/rowbadgestore";
import { loadUploadSettings, saveUploadSettings } from "../src/upload/settingsstore";
import UploadPanel from "../src/upload/UploadPanel";
import { DEFAULT_UPLOAD_SETTINGS, SETTINGS_FIELDS } from "../src/lib/upload/settings";
import { rowSettings } from "../src/lib/upload/decorations";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIR = "architecture";
const FOG = pairId(DIR, "fog", "");
const COURT = pairId(DIR, "court", "");
const THIRD = pairId(DIR, "third", "");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';

const stored = new Map<string, unknown>();
vi.mock("../src/batch/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/batch/store")>();
  return {
    ...actual,
    saveHandles: vi.fn(async (name: string, handles: unknown) => { stored.set(name, handles); }),
    loadHandles: vi.fn(async (name: string) => stored.get(name) ?? null),
  };
});

let host: HTMLDivElement;
let ui: Root;
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

function makeRoot(): BinDir {
  const root = new BinDir("split_root");
  const dir = new BinDir(DIR);
  for (const name of ["fog", "court", "third"] as const) {
    const file = `${name}_AI`;
    const id = pairId(DIR, name, "");
    const meta = pairFile(DIR, `${file}.png`, { id, versions: [
      svgVersion(`${DIR}/${file}.svg`, { version: 1, review: "approved" }),
    ] });
    dir.children.set(`${file}.png`, new BinFile(`${file}.png`, "approved AI", 3100));
    dir.children.set(`${file}.svg`, new BinFile(`${file}.svg`, SVG, 3400));
    dir.children.set(`${file}.svg.json`, new BinFile(`${file}.svg.json`, serializePairMeta(meta), 3400));
  }
  root.children.set(DIR, dir);
  return root;
}

beforeEach(() => {
  localStorage.clear();
  stored.clear();
  clearKnownRoots();
  forgetRestoreNote();
  resetAppStore();
  resetRowBadges();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No provider calls for local settings"); }));
  vi.stubGlobal("showDirectoryPicker", () => Promise.reject(new Error("picker not needed")));
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => ui.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetRowBadges();
});

async function mount(): Promise<void> {
  stored.set("__upload__", { source: makeRoot() });
  await act(async () => {
    ui = createRoot(host);
    ui.render(<HistoryProvider><UploadPanel /><HistoryBar /></HistoryProvider>);
  });
  await waitUntil(() => q(`upload-row-${FOG}`) !== null, "upload rows");
  await settle(0);
}

async function click(id: string): Promise<void> {
  expect(q(id), id).not.toBeNull();
  await act(async () => { q(id)!.click(); });
  await settle(0);
}

function nativeValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
}

async function typeInto(id: string, value: string): Promise<void> {
  const el = q(id) as HTMLInputElement;
  await act(async () => {
    nativeValue(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle(0);
}



const state = () => loadUploadSettings();
function effective(id: string) {
  const s = state(); return rowSettings(s.defaults, id, s.overrides, s.applied);
}
const historyCount = () => Number(q('hist-open')!.textContent!.match(/\((\d+)\)/)![1]);

it('offers Apply as local only globally, disables it for no checks, and keeps ordinary edits live', async () => {
  await mount(); await click('upload-settings-open');
  expect(q('upload-set-apply-local')).not.toBeNull();
  expect((q('upload-set-apply-local') as HTMLButtonElement).disabled).toBe(true);
  await typeInto('upload-set-padding-left', '17');
  expect(state().overrides).toEqual({});
  expect(effective(FOG).paddingPct).toEqual({left:17,right:8,top:8,bottom:8});
  await click('upload-set-close'); await click(`upload-settings-btn-${FOG}`);
  expect(q('upload-set-apply-local')).toBeNull();
});

it('freezes two batches differently, replaces old pins and leaves remaining inheritance live', async () => {
  saveUploadSettings({defaults:DEFAULT_UPLOAD_SETTINGS, overrides:{[FOG]:{strokePx:40,jpegQuality:0.55}}});
  await mount(); await click(`upload-check-${FOG}`); await click('upload-settings-open');
  await typeInto('upload-set-padding-left','11'); await typeInto('upload-set-artboard','512');
  const before = historyCount();
  await click('upload-set-apply-local');
  expect(historyCount()).toBe(before + 1);
  expect(Object.keys(state().overrides[FOG]).sort()).toEqual([...SETTINGS_FIELDS].sort());
  expect(state().overrides[FOG]).toMatchObject({strokePx:0,jpegQuality:0.92,artboard:{mode:'preset',size:512}});
  const pinnedA = state().overrides[FOG];
  const once = historyCount(); await click('upload-set-apply-local'); expect(historyCount()).toBe(once);
  await click('upload-set-close'); await click('upload-deselect'); await click(`upload-check-${COURT}`);
  await click('upload-settings-open'); await typeInto('upload-set-artboard','1024');
  await typeInto('upload-set-padding-left','23'); await click('upload-set-apply-local');
  await typeInto('upload-set-artboard','2048'); await typeInto('upload-set-padding-left','30');
  expect(state().overrides[FOG]).toEqual(pinnedA);
  expect(effective(COURT)).toMatchObject({artboard:{size:1024},paddingPct:{left:23}});
  expect(effective(THIRD)).toMatchObject({artboard:{size:2048},paddingPct:{left:30}});
  await click('upload-set-close'); await click(`upload-settings-btn-${FOG}`);
  expect(q('upload-set-marker-artboard')!.textContent).toBe('overridden');
  expect(q('upload-set-marker-padding')!.textContent).toBe('overridden');
  await click('upload-set-reset');
  expect(state().overrides[FOG]).toBeUndefined(); expect(effective(FOG).artboard.size).toBe(2048);
  expect(fetch).not.toHaveBeenCalled();
});

it('applies to hidden checks, preserves decorations, and undoes/redoes the whole batch exactly', async () => {
  const originals = {[FOG]:{strokePx:7},[COURT]:{background:'#123456'}};
  const applied = {[FOG]:{shadowEnabled:true,shadowGapPct:17},[COURT]:{badgeEnabled:true}};
  saveUploadSettings({defaults:DEFAULT_UPLOAD_SETTINGS,overrides:originals,applied});
  await mount(); await click(`upload-check-${FOG}`); await click(`upload-check-${COURT}`);
  await typeInto('upload-search','fog'); expect(q(`upload-row-${COURT}`)).toBeNull();
  await click('upload-settings-open'); expect(q('upload-set-apply-local')!.textContent).toContain('(2)');
  const before = historyCount(); const label = q('hist-label')!.textContent;
  await click('upload-set-apply-local'); expect(historyCount()).toBe(before + 1); const pinned = state().overrides;
  expect(Object.keys(pinned).sort()).toEqual([FOG,COURT].sort());
  expect(pinned[FOG]).toMatchObject({shadowEnabled:true,shadowGapPct:17,badgeEnabled:false});
  expect(pinned[COURT]).toMatchObject({badgeEnabled:true,shadowEnabled:false});
  expect(state().applied).toEqual(applied);
  await typeInto('upload-set-padding-left','25');
  await click('hist-undo'); expect(state().overrides).toEqual(originals); expect(q('hist-label')!.textContent).toBe(label);
  await click('hist-redo'); expect(state().overrides).toEqual(pinned);
  expect(state().applied).toEqual(applied);
  expect(state().defaults.paddingPct).toMatchObject({left:25});
  expect(effective(THIRD).paddingPct).toMatchObject({left:25});
  await click('upload-set-close'); await click('upload-reset-settings');
  expect(state().overrides).toEqual({}); expect(state().applied).toEqual(applied);
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps content/default/off choices across panel reload and commits a focused draft before Apply', async () => {
  await mount(); await click(`upload-check-${FOG}`); await click('upload-settings-open');
  const field = q('upload-set-artboard') as HTMLSelectElement;
  expect(field.value).toBe('content');
  const width = q('upload-set-artboard-w'); expect(width).toBeNull();
  await typeInto('upload-set-artboard','custom');
  const input = q('upload-set-artboard-w') as HTMLInputElement;
  await act(async () => input.focus()); await typeInto('upload-set-artboard-w','730');
  // Native click sequence leaves the draft input before the action fires.
  await act(async () => {input.blur(); (q('upload-set-apply-local') as HTMLButtonElement)?.focus();});
  await click('upload-set-apply-local');
  expect(state().overrides[FOG].artboard?.width).toBe(730);
  await typeInto('upload-set-artboard','content'); await click('upload-set-padding-default');
  await click('upload-set-apply-local');
  const frozen = state().overrides[FOG]; expect(frozen.paddingPct).toBeNull();
  expect(frozen).toMatchObject({shadowEnabled:false,badgeEnabled:false,sizeGuideEnabled:false,artboard:{mode:'content'}});
  await act(async () => ui.unmount());
  await mount();
  expect(state().overrides[FOG]).toEqual(frozen);
  await click('upload-settings-open'); await typeInto('upload-set-artboard','4096');
  expect(effective(FOG).artboard.mode).toBe('content');
  expect(effective(THIRD).artboard).toMatchObject({mode:'preset',size:4096});
  expect(fetch).not.toHaveBeenCalled();
});


it('supports one-step persistent undo and redo while the upload panel is unmounted', async () => {
  await mount(); await click(`upload-check-${FOG}`); await click(`upload-check-${COURT}`);
  await click('upload-settings-open'); await click('upload-set-apply-local');
  const pinned = state().overrides;
  await act(async () => ui.render(<HistoryProvider><HistoryBar /></HistoryProvider>));
  await click('hist-undo'); expect(state().overrides).toEqual({});
  await click('hist-redo'); expect(state().overrides).toEqual(pinned);
  await act(async () => ui.render(<HistoryProvider><UploadPanel /><HistoryBar /></HistoryProvider>));
  await waitUntil(() => q(`upload-row-${FOG}`) !== null, 'remounted upload rows');
  expect(state().overrides).toEqual(pinned);
  expect(fetch).not.toHaveBeenCalled();
});
