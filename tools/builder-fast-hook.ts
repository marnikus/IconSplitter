// builder-fast-hook.ts — pure in-memory BuilderApi for the fast static-render
// smoke lane. The full Vitest UI suite still exercises the real hook and DOM.
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/upload/gemini";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { DEFAULT_SELECTION_RECIPE } from "../src/lib/svgBuilder/selection";
import { DEFAULT_SHEET_PROMPT } from "../src/lib/svgBuilder/metadata";

const asset = {
  id: "asset-a", base: "star", suffix: "", label: "Star", category: "UI", tags: ["ui", "star"],
  svgPath: "icons/ui/star_AI.svg", svgName: "star_AI.svg", version: 1, fingerprint: "10:1",
  metaPath: "icons/ui/star_AI.svg.json", approved: true,
};

const noop = () => undefined;
const presets = { pickPreset: noop, quickLoadPreset: noop, savePresetAs: noop, deletePreset: noop };

export function useSvgBuilder() {
  return {
    supported: false, root: null, discovery: null, busy: null, status: "Fast smoke lane", error: false,
    config: DEFAULT_CONFIG, recipe: DEFAULT_SELECTION_RECIPE, seed: DEFAULT_SELECTION_RECIPE.seed,
    lockedIds: [], listView: { query: "", category: "All", sort: "name" },
    prefs: { zoom: 1, providerOpen: true, inspectorOpen: true, libraryThumb: 56 },
    prompt: DEFAULT_SHEET_PROMPT, presets: [], presetPick: "", gemini: DEFAULT_GEMINI_CONFIG,
    key: { value: null, source: "none", mask: "not set", title: "No Gemini API key yet",
      note: "stored in IndexedDB", keySet: false },
    modelCheck: { state: "idle", detail: "" }, metadata: null, draft: null, preview: null,
    dialog: "none", svgTexts: {},
    assets: [asset], visibleAssets: [asset], categories: ["All", "UI"],
    profiles: [{ id: "all", label: "All icons", tags: [] }],
    layout: { content: { x: 0, y: 0, width: 100, height: 100 }, banner: null, grid: null,
      cells: [], fitScale: 1, overflow: false, capacity: 28 },
    repository: null, notices: [], document: null, auditLine: "1 approved · 0 excluded",
    checked: [], activeId: null, anchorId: null, placedIds: [],
    actions: {
      openFolder: noop, rescan: noop, setConfig: noop, applyLayoutPreset: noop, setRecipe: noop,
      setSeed: noop, shuffle: noop, toggleAsset: noop, toggleLock: noop, clearSelection: noop,
      setSearch: noop, setCategory: noop, setZoom: noop, toggleProvider: noop, toggleInspector: noop,
      setPrompt: noop, resetPrompt: noop, presets, setGemini: noop, checkModel: noop, saveKey: noop,
      forgetKey: noop, generateMetadata: noop, confirmMetadata: noop, cancelMetadata: noop,
      acceptMetadataDraft: noop, exportSvg: noop, exportPng: noop, copySvg: noop, savePreset: noop,
      loadPreset: noop, openBrief: noop, closeDialog: noop, presetOfModel: () => ({}),
    },
  };
}
