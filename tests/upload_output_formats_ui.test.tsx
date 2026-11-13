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
import { clearGeminiKey, saveGeminiKey } from "../src/upload/keystore";
import { rememberMeta } from "../src/upload/metacache";
import { sha256HexText } from "../src/lib/upload/hash";
import { readTextAt } from "../src/lib/fs";
import { STOCK_TEST_META } from "./helpers/stockexport";
import UploadPanel from "../src/upload/UploadPanel";
import { DEFAULT_UPLOAD_SETTINGS } from "../src/lib/upload/settings";
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

it('offers on-by-default SVG/JPEG toggles and persists local format choices through Apply/reset', async () => {
  await mount();await click('upload-settings-open');
  for(const format of ['svg','jpeg']) {
    expect(q(`upload-set-${format}`)).not.toBeNull();
    expect((q(`upload-set-${format}`) as HTMLInputElement).checked).toBe(true);
  }
  await click('upload-set-jpeg');await click('upload-set-svg');
  expect(q('upload-set-formats-warning')!.textContent).toMatch(/at least one/i);
  expect(loadUploadSettings().defaults).toMatchObject({includeSvg:false,includeJpeg:false,includeEps:false});
  await click('upload-set-eps');expect(q('upload-set-formats-warning')).toBeNull();
  await click('upload-set-close');await click(`upload-check-${FOG}`);await click('upload-settings-open');
  await click('upload-set-apply-local');await click('upload-set-svg');await click('upload-set-jpeg');
  expect(loadUploadSettings().overrides[FOG]).toMatchObject({includeSvg:false,includeJpeg:false,includeEps:true});
  await click('hist-undo');expect(loadUploadSettings().overrides[FOG]).toBeUndefined();
  await click('hist-redo');expect(loadUploadSettings().overrides[FOG]).toMatchObject({includeSvg:false,includeJpeg:false});
  await click('upload-set-close');await click(`upload-settings-btn-${FOG}`);
  expect(q('upload-set-marker-svg')!.textContent).toBe('overridden');
  expect((q('upload-set-svg') as HTMLInputElement).checked).toBe(false);
  await click('upload-set-reset');expect((q('upload-set-svg') as HTMLInputElement).checked).toBe(true);
  expect(fetch).not.toHaveBeenCalled();
});

it('does not open a paid metadata confirmation when all selected formats are disabled', async () => {
  await saveGeminiKey(['test','format','selection'].join('-'));
  saveUploadSettings({defaults:{...DEFAULT_UPLOAD_SETTINGS,includeSvg:false,includeJpeg:false,includeEps:false},overrides:{}});
  await mount();await click(`upload-check-${FOG}`);await click('upload-export-selected');
  expect(q('upload-meta-backdrop')).toBeNull();
  expect(q('upload-toast')!.textContent).toMatch(/format/i);expect(fetch).not.toHaveBeenCalled();
});

it('excludes no-output rows from the paid confirmation but keeps the whole mixed export selection', async () => {
  await saveGeminiKey(['test','mixed','formats'].join('-'));
  const court=pairId(DIR,'court','');
  saveUploadSettings({defaults:{...DEFAULT_UPLOAD_SETTINGS,includeSvg:false,includeJpeg:false,includeEps:false},overrides:{[court]:{includeSvg:true}}});
  await mount();await click(`upload-check-${FOG}`);await click(`upload-check-${court}`);
  await click('upload-export-selected');
  expect(q('upload-meta-backdrop')).not.toBeNull();
  expect(host.querySelector('#upload-meta-title')!.textContent).toContain('Generate metadata for 1 icon, then export 2');
  expect(q('upload-meta-then-export')!.textContent).toMatch(/2/);
  expect(fetch).not.toHaveBeenCalled();await click('upload-meta-cancel');
});

it('reports unavailable EPS-only exports as failed, never promising a partial package', async()=>{
  saveUploadSettings({defaults:{...DEFAULT_UPLOAD_SETTINGS,includeSvg:false,includeJpeg:false,includeEps:true,epsConverter:'inkscape'},overrides:{}});
  await mount();await click(`upload-export-${FOG}`);
  await waitUntil(()=>q(`upload-status-${FOG}`)!.textContent!.includes('Failed'),'EPS-only failure');
  expect(q('upload-toast')!.textContent).toContain('0 exported · 1 failed');
  expect(q('upload-toast')!.textContent).toContain('EPS-only');
  expect(q('upload-toast')!.textContent).not.toContain('will be partial');
  for(const [url] of vi.mocked(fetch).mock.calls) expect(String(url)).toContain('127.0.0.1:47391');
});

it('isolates a no-format row from an eligible SVG-only peer in the actual selected export batch', async()=>{
  const court=pairId(DIR,'court','');
  saveUploadSettings({defaults:{...DEFAULT_UPLOAD_SETTINGS,includeJpeg:false},overrides:{[FOG]:{includeSvg:false}}});
  rememberMeta(`sha256:${await sha256HexText(SVG)}`,{state:'accepted',meta:STOCK_TEST_META});
  await mount();await click(`upload-check-${FOG}`);await click(`upload-check-${court}`);await click('upload-export-selected');
  await waitUntil(()=>q(`upload-status-${court}`)!.textContent!.includes('Processed'),'eligible peer export');
  expect(q(`upload-status-${FOG}`)!.textContent).toContain('Failed');
  expect(q('upload-toast')!.textContent).toContain('1 exported · 1 failed');
  expect(q('upload-meta-backdrop')).toBeNull();expect(fetch).not.toHaveBeenCalled();
  const root=(stored.get('__upload__') as {source:BinDir}).source;
  expect(await readTextAt(root,'architecture/export/court.svg')).not.toBeNull();
  expect(await readTextAt(root,'architecture/export/fog.svg')).toBeNull();
  expect(await readTextAt(root,'architecture/fog_AI.svg')).toBe(SVG);
});
