// builder-fast-hook.ts — pure in-memory BuilderApi for the fast static-render
// smoke lane. The full Vitest UI suite still exercises the real hook and DOM.
import { DEFAULT_GEMINI_CONFIG } from "../src/lib/upload/gemini";
import { DEFAULT_CONFIG } from "../src/lib/svgBuilder/config";
import { DEFAULT_SEED, DEFAULT_SELECTION_RECIPE } from "../src/lib/svgBuilder/selection";
import { computeLayout } from "../src/lib/svgBuilder/layout";
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
    config: DEFAULT_CONFIG, recipe: DEFAULT_SELECTION_RECIPE, seed: DEFAULT_SEED,
    lockedIds: [], listView: { query: "", category: "All", sort: "name" },
    prefs: { zoom: 1, fit: true, providerOpen: true, layout: "editorial", metaOpen: true, metaHeight: null },
    prompt: DEFAULT_SHEET_PROMPT, presets: [], presetPick: "", gemini: DEFAULT_GEMINI_CONFIG,
    key: { value: null, source: "none", mask: "not set", title: "No Gemini API key yet",
      note: "stored in IndexedDB", keySet: false },
    modelCheck: { state: "idle", detail: "" }, metadata: null, draft: null, preview: null,
    dialog: "none", svgTexts: {},
    assets: [asset], visibleAssets: [asset], categories: ["All", "UI"],
    profiles: [{ id: "all", label: "All icons", tags: [] }],
    layout: computeLayout(DEFAULT_CONFIG),
    repository: null, document: null, auditLine: "1 approved · 0 excluded",
    checked: [], activeId: null, anchorId: null, placedIds: [],
    actions: {
      openFolder: noop, rescan: noop, setConfig: noop, applyLayoutPreset: noop, resetConfig: noop, setRecipe: noop,
      reshuffle: noop, toggleAsset: noop, toggleLock: noop, clearSelection: noop, autoPlace: noop, fitSelection: noop,
      setSearch: noop, setCategory: noop, setZoom: noop, fitZoom: noop, undo: noop, redo: noop, toggleProvider: noop, toggleMeta: noop, setMetaHeight: noop,
      setPrompt: noop, resetPrompt: noop, presets, setGemini: noop, checkModel: noop, saveKey: noop,
      forgetKey: noop, generateMetadata: noop, confirmMetadata: noop, cancelMetadata: noop,
      acceptMetadataDraft: noop, exportSvg: noop, exportPng: noop, copySvg: noop, savePreset: noop,
      loadPreset: noop, openBrief: noop, openMetadata: noop, say: noop, closeDialog: noop, presetOfModel: () => ({}),
    },
  };
}
