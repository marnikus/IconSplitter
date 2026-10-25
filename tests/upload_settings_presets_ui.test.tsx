// Real upload panel: local batch snapshots, live globals, persistence and history.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serializePairMeta } from "../src/lib/pairmeta";
import { pairId } from "../src/lib/pairing";
import { clearKnownRoots } from "../src/lib/knownroots";
import { getAppState, resetAppStore } from "../src/state/appstore";
import { forgetRestoreNote } from "../src/upload/jobstore";
import { resetRowBadges } from "../src/upload/rowbadgestore";
import { loadUploadSettings, saveUploadSettings } from "../src/upload/settingsstore";
import { clearGeminiKey } from "../src/upload/keystore";
import { readTextAt, readBytesAt } from "../src/lib/fs";
import { loadExportPresets } from "../src/upload/settingspresetstore";
import UploadPanel from "../src/upload/UploadPanel";
import { rowSettings } from "../src/lib/upload/decorations";
import { normalizeSettings, DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
import { HistoryProvider } from "../src/state/HistoryProvider";
import HistoryBar from "../src/ui/HistoryBar";
import { BinDir, BinFile } from "./helpers/binfakefs";
import { pairFile } from "./helpers/pairfile";
import { svgVersion } from "./helpers/svgpair";
import { settle, waitUntil } from "./helpers/quiet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIR = "architecture";
const FOG = pairId(DIR, "fog", "");
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

beforeEach(async () => {
  await clearGeminiKey();
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

async function type(id: string, value: string): Promise<void> {
  const el=q(id) as HTMLInputElement;
  await act(async()=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  });await settle(0);
}
async function select(name: string): Promise<void> {
  const el=q('upload-settings-preset-select') as HTMLSelectElement;
  await act(async()=>{el.value=name;el.dispatchEvent(new Event('change',{bubbles:true}));});await settle(0);
}

it('saves/loads global snapshots explicitly and renames/removes without changing current settings',async()=>{
  saveUploadSettings({defaults:{...DEFAULT_UPLOAD_SETTINGS,includeJpeg:false},overrides:{[FOG]:{includeJpeg:true}}});
  await mount();await click('upload-settings-open');
  expect(q('upload-settings-preset-select')).not.toBeNull();
  await type('upload-settings-preset-name','Vectors');await click('upload-settings-preset-save');
  expect(q('upload-settings-preset-status')!.textContent).toContain('saved');
  await click('upload-set-jpeg');await click('upload-set-svg');
  await select('Vectors');expect(loadUploadSettings().defaults.includeSvg).toBe(false);
  await click('upload-settings-preset-load');
  expect(loadUploadSettings().defaults).toMatchObject({includeSvg:true,includeJpeg:false});
  expect(loadUploadSettings().overrides[FOG]).toEqual({includeJpeg:true});
  await type('upload-settings-preset-name','Shop vectors');await click('upload-settings-preset-rename');
  expect(q('upload-settings-preset-select')!.textContent).toContain('Shop vectors');
  expect(q('upload-settings-preset-select')!.textContent).not.toContain('Vectors');
  await click('upload-set-close');await click('upload-settings-open');
  await select('Shop vectors');await click('upload-settings-preset-remove');await click('upload-settings-preset-remove-cancel');
  expect(q('upload-settings-preset-select')!.textContent).toContain('Shop vectors');
  await click('upload-settings-preset-remove');await click('upload-settings-preset-remove-confirm');
  expect(q('upload-settings-preset-select')!.textContent).not.toContain('Shop vectors');
  expect(loadUploadSettings().defaults.includeJpeg).toBe(false);expect(fetch).not.toHaveBeenCalled();
  await click('upload-set-close');await click(`upload-settings-btn-${FOG}`);
  expect(q('upload-settings-preset-select')).toBeNull();
});

it('rejects duplicate/blank names and reports failed storage without claiming success',async()=>{
  await mount();await click('upload-settings-open');await click('upload-settings-preset-save');
  expect(q('upload-settings-preset-status')!.textContent).toMatch(/name/i);
  await type('upload-settings-preset-name','One');await click('upload-settings-preset-save');
  await type('upload-settings-preset-name','one');await click('upload-settings-preset-save');
  expect(q('upload-settings-preset-status')!.textContent).toMatch(/already exists/i);
  const storage=localStorage;
  vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.getItem(key),setItem:()=>{throw new Error('quota');}});
  await type('upload-settings-preset-name','Two');await click('upload-settings-preset-save');
  expect(q('upload-settings-preset-status')!.textContent).toMatch(/storage/i);
  expect(q('upload-settings-preset-select')!.textContent).not.toContain('Two');
});

it('reloads rich presets after a fresh panel boot without changing checks, local pins or applied decorations',async()=>{
  const defaults=normalizeSettings({...DEFAULT_UPLOAD_SETTINGS,includeJpeg:false,includeEps:true,strokeLinecap:'round' as const,
    paddingPct:{left:2,right:3,top:4,bottom:5},artboard:{mode:'custom' as const,size:512,width:512,height:256},
    badgeTemplateSvg:SVG,shadowWidthPct:65});
  const applied={[FOG]:{shadowEnabled:true,shadowWidthPct:70,shadowGapPct:9}};
  const overrides={[FOG]:{includeJpeg:true}};
  saveUploadSettings({defaults,applied,overrides});
  await mount();await click('upload-settings-open');await type('upload-settings-preset-name','Rich');
  expect(loadUploadSettings().defaults).toEqual(defaults);
  await click('upload-settings-preset-save');expect(loadExportPresets()[0].settings).toEqual(defaults);
  await click('upload-set-jpeg');await type('upload-set-padding-left','17');
  await click('upload-set-close');
  await act(async()=>ui.unmount());resetAppStore();await mount();
  expect(loadUploadSettings().defaults.includeJpeg).toBe(true);
  await click(`upload-check-${FOG}`);const checked=[...getAppState().upload.checked];
  await click('upload-settings-open');expect(loadExportPresets()[0].settings).toEqual(defaults);
  await select('Rich');await click('upload-settings-preset-load');
  const restored=loadUploadSettings();
  expect(restored.defaults).toEqual(defaults);expect(restored.applied).toEqual(applied);expect(restored.overrides).toEqual(overrides);
  expect(getAppState().upload.checked).toEqual(checked);
  expect(rowSettings(restored.defaults,FOG,restored.overrides,restored.applied)).toMatchObject({includeJpeg:true,shadowEnabled:true,shadowWidthPct:70});
  const third=pairId(DIR,'third','');
  expect(rowSettings(restored.defaults,third,restored.overrides,restored.applied)).toMatchObject({includeJpeg:false,shadowEnabled:false,shadowWidthPct:65});
  await click('upload-set-close');await click(`upload-export-${third}`);
  await waitUntil(()=>q(`upload-status-${third}`)!.textContent!.includes('Processed'),'loaded preset export');
  const root=(stored.get('__upload__') as {source:BinDir}).source;
  expect(await readTextAt(root,'architecture/export/third.svg')).toContain('viewBox="0 0 512 256"');
  expect((await readTextAt(root,'architecture/export/third.eps'))?.match(/^%%BoundingBox:.+$/m)?.[0]).toBe('%%BoundingBox: 0 0 384 192');
  expect(await readBytesAt(root,'architecture/export/third.jpg')).toBeNull();
  expect(await readTextAt(root,'architecture/third_AI.svg')).toBe(SVG);
  await click('upload-settings-open');await click('upload-set-apply-local');
  expect(loadUploadSettings().overrides[FOG].includeJpeg).toBe(false);
  await click('hist-undo');expect(loadUploadSettings().overrides).toEqual(overrides);
  expect(loadUploadSettings().defaults).toEqual(defaults);
  expect(fetch).not.toHaveBeenCalled();
});
