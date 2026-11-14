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
import type { SheetMetadataFields } from "../lib/svgBuilder/types";
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
  setConfig: (config: SheetConfig, label?: string, gesture?: boolean | string) => void;
  applyLayoutPreset: (id: LayoutPresetId) => void;
  resetConfig: () => void;
  setRecipe: (patch: Partial<SelectionRecipe>) => void;
  reshuffle: () => void;
  toggleAsset: (id: string) => void;
  toggleLock: (id: string) => void;
  /** Artboard ×: remove the icon from the sheet and keep it out of later picks. */
  excludeAsset: (id: string, keepEmpty?: boolean) => void;
  restoreExcluded: () => void;
  toggleScores: (show: boolean) => void;
  /** Opacity of the artboard % labels, 1–100. */
  setScoreOpacity: (percent: number) => void;
  /** 🗑 Decline the icon in Generate SVG (no longer approved; one undoable step). */
  declineAsset: (id: string) => void;
  /** The builder follows a decline written to files: the icons leave the library, sheet and locks. */
  dropAssets: (ids: readonly string[]) => void;
  /** Show / hide the "used N times" index on the artboard's icons (display-only). */
  toggleUsage: (show: boolean) => void;
  /** Show / hide the red layout guides, and their opacity 1–100 (display-only). */
  toggleGuides: (show: boolean) => void;
  setGuideOpacity: (percent: number) => void;
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
  /** The current sheet's metadata fields (2026-11-14, the upload tab's editor): edit, then ✓ Accept re-validates. */
  editMetadata: (patch: Partial<SheetMetadataFields>) => void;
  acceptMetadata: () => void;
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
  /** ↺ Template (2026-11-14): the artboard drops its own look changes and inherits everything again. */
  resetArtboardLook: (id: string) => void;
  /** Double-click on a row (2026-11-14): open that artboard on the stage (a changed template asks first). */
  openArtboard: (id: string) => void;
  /** The open artboard's draft (2026-11-14): ✓ Save writes it; ↺ Reset goes back to what is saved. */
  saveArtboard: () => void;
  resetArtboard: () => void;
  /** Unsaved template edits (2026-11-14): back to the saved look (undoable); the leave question's three answers. */
  resetTemplate: () => void;
  leaveSave: () => void;
  leaveDiscard: () => void;
  leaveCancel: () => void;
  presetOfModel: () => SheetPreset;
  /** Saved templates (2026-11-13): save the look (updates the one being edited), save as new, open to edit, rename, remove. */
  saveTemplate: () => void;
  saveTemplateAsNew: () => void;
  editTemplate: (id: string) => void;
  renameTemplate: (id: string, name: string) => void;
  removeTemplate: (id: string) => void;
  /** Height of the template pictures (shared 48–800 px zoom); display-only. */
  setTemplateZoom: (px: number) => void;
  /** Preset JSON (2026-11-13): open the window, the sheet as JSON, apply pasted JSON (true when read), copy, copy for AI, download. */
  openPresetJson: () => void;
  presetJsonText: () => string;
  applyPresetJson: (text: string) => boolean;
  copyPresetJson: (text: string) => void;
  copyPresetForAi: () => void;
  downloadPresetJson: (text: string) => void;
  /** Templates as checkable blueprints, and their final artboards (2026-11-13), RULE 25 gestures. */
  templateGesture: (id: string, intent: import("../lib/reviewselect").SelectIntent) => void;
  toggleTemplateCheck: (id: string) => void;
  setTemplateChecks: (ids: readonly string[], on: boolean) => void;
  addArtboard: (templateId: string) => void;
  artboardGesture: (id: string, intent: import("../lib/reviewselect").SelectIntent) => void;
  toggleArtboardCheck: (id: string) => void;
  setArtboardChecks: (ids: readonly string[], on: boolean) => void;
  renameArtboard: (id: string, name: string) => void;
  removeArtboards: (ids: readonly string[]) => void;
  closeArtboard: () => void;
  /** Sheet metadata for the given artboards: prepare the exact requests (confirmation), send them, or cancel. */
  generateArtboardsMetadata: (ids: readonly string[]) => void;
  confirmArtboardsMetadata: () => void;
  cancelArtboardsMetadata: () => void;
  /** Export all selected (2026-11-14): the checked artboards (else the open one) as stock packages under `_artboard_sheets`. */
  exportSelectedArtboards: () => void;
}
