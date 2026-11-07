// actiontypes.ts — the narrow context all builder actions see. Presentation
// never reads the store directly; it calls these stable interfaces.
import type { HistoryActions } from "../state/HistoryProvider";
import type { RowSelection } from "../lib/reviewselect";
import type { GeminiConfig } from "../lib/upload/gemini";
import type { BuilderIconAsset, SelectionRecipe, SheetConfig, SheetLayout, SheetPreset } from "../lib/svgBuilder/types";
import type { SheetDocument } from "../lib/svgBuilder/types";
import type { PresetActions } from "../ui/presetops";
import type { BuilderDiscovery } from "./discovery";
import type { AssetRepository } from "./repository";
import type { BuilderModel } from "./model";
import type { BuilderScanRefs } from "./scan";
import type { DirHandleLike } from "../lib/fs";

export interface BuilderActionContext {
  model: BuilderModel;
  assets: readonly BuilderIconAsset[];
  visibleAssets: readonly BuilderIconAsset[];
  placedIds: readonly string[];
  repository: AssetRepository | null;
  document: SheetDocument | null;
  layout: SheetLayout;
  notices: readonly string[];
  checked: RowSelection;
  discovery: BuilderDiscovery | null;
  scanRefs: BuilderScanRefs;
  hist: HistoryActions | null;
  presetActions: PresetActions;
  dispatch: (patch: Partial<BuilderModel>) => void;
  setChecked: (next: RowSelection, label: string) => void;
  setRoot: (root: DirHandleLike | null) => void;
  setDiscovery: (found: BuilderDiscovery | null) => void;
  setBusy: (busy: string | null) => void;
  say: (message: string, error?: boolean) => void;
}

export interface BuilderActions {
  openFolder: () => void;
  rescan: () => void;
  setConfig: (config: SheetConfig) => void;
  applyLayoutPreset: (id: string) => void;
  setRecipe: (recipe: SelectionRecipe) => void;
  setSeed: (seed: number) => void;
  shuffle: () => void;
  toggleAsset: (id: string) => void;
  toggleLock: (id: string) => void;
  clearSelection: () => void;
  setSearch: (query: string) => void;
  setCategory: (category: string) => void;
  setZoom: (zoom: number) => void;
  toggleProvider: (open: boolean) => void;
  toggleInspector: (open: boolean) => void;
  setPrompt: (text: string) => void;
  resetPrompt: () => void;
  presets: PresetActions;
  setGemini: (patch: Partial<GeminiConfig>) => void;
  checkModel: () => void;
  saveKey: (key: string) => void;
  forgetKey: () => void;
  generateMetadata: () => void;
  confirmMetadata: () => void;
  cancelMetadata: () => void;
  acceptMetadataDraft: () => void;
  exportSvg: () => void;
  exportPng: () => void;
  copySvg: () => void;
  savePreset: () => void;
  loadPreset: (text: string) => void;
  openBrief: () => void;
  closeDialog: () => void;
  presetOfModel: () => SheetPreset;
}
