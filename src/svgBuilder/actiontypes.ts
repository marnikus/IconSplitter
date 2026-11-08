// actiontypes.ts — the narrow context all builder actions see. Presentation
// never reads the store directly; it calls these stable interfaces.
import type { HistoryActions } from "../state/HistoryProvider";
import type { RowSelection } from "../lib/reviewselect";
import type { GeminiConfig } from "../lib/upload/gemini";
import type { BuilderIconAsset, BuilderProfile, SelectionRecipe, SheetConfig, SheetLayout, SheetPreset } from "../lib/svgBuilder/types";
import type { LayoutPresetId } from "../lib/svgBuilder/config";
import type { SimilarityReference } from "../lib/iconIndex/similarity";
import type { IconIndexRecord } from "../lib/iconIndex/record";
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
  profiles: readonly BuilderProfile[];
  reference: SimilarityReference;
  scoreOf: (asset: BuilderIconAsset) => number | null;
  index: ReadonlyMap<string, IconIndexRecord>;
  checked: RowSelection;
  discovery: BuilderDiscovery | null;
  scanRefs: BuilderScanRefs;
  hist: HistoryActions | null;
  presetActions: PresetActions;
  dispatch: (patch: Partial<BuilderModel>) => void;
  setChecked: (next: RowSelection, label: string) => void;
  /** Automatic placement (first scan, grid resize): no history entry. */
  setCheckedQuiet: (ids: readonly string[]) => void;
  setRoot: (root: DirHandleLike | null) => void;
  setDiscovery: (found: BuilderDiscovery | null) => void;
  setBusy: (busy: string | null) => void;
  say: (message: string, error?: boolean) => void;
}

export interface BuilderActions {
  openFolder: () => void;
  rescan: () => void;
  /** `gesture` coalesces a slider drag into one undo entry. */
  setConfig: (config: SheetConfig, label?: string, gesture?: boolean) => void;
  applyLayoutPreset: (id: LayoutPresetId) => void;
  resetConfig: () => void;
  setRecipe: (patch: Partial<SelectionRecipe>) => void;
  reshuffle: () => void;
  toggleAsset: (id: string) => void;
  toggleLock: (id: string) => void;
  /** Artboard ×: remove the icon from the sheet and keep it out of later picks. */
  excludeAsset: (id: string) => void;
  restoreExcluded: () => void;
  toggleScores: (show: boolean) => void;
  clearSelection: () => void;
  setSearch: (query: string) => void;
  setCategory: (category: string) => void;
  autoPlace: () => void;
  fitSelection: () => void;
  setZoom: (zoom: number) => void;
  fitZoom: () => void;
  undo: () => void;
  redo: () => void;
  toggleProvider: (open: boolean) => void;
  /** Fold / unfold the metadata prompt + Gemini widget. */
  toggleMeta: (open: boolean) => void;
  /** A dragged widget height in px; null restores the natural height. */
  setMetaHeight: (height: number | null) => void;
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
  /** "Icons indexing": vectorise every approved icon whose index is missing or stale. */
  startIndexing: () => void;
  cancelIndexing: () => void;
  openMetadata: () => void;
  /** One honest toast line (status). */
  say: (message: string, error?: boolean) => void;
  closeDialog: () => void;
  presetOfModel: () => SheetPreset;
}
