// model.ts — the builder workspace's one React state shape. Pure reducer and
// validated initial state; storage, provider calls and disk IO stay in siblings.
import type { GeminiConfig } from "../lib/upload/gemini";
import { loadGeminiConfig } from "../upload/configstore";
import { getAppState } from "../state/appstore";
import type { KeyRead, KeySource } from "../lib/keyvault";
import { maskKey } from "../lib/svgsecret";
import { DEFAULT_SEED, DEFAULT_SELECTION_RECIPE } from "../lib/svgBuilder/selection";
import type {
  BuilderListView, BuilderUndoPatch, SelectionRecipe, SheetConfig, SheetMetadata,
} from "../lib/svgBuilder/types";
import type { DirHandleLike } from "../lib/fs";
import type { PromptPreset } from "../lib/promptpresets";
import type { BuilderDiscovery } from "./discovery";
import { loadSheetConfig } from "./configstore";
import { loadBuilderListView } from "./listview";
import { loadBuilderPrefs, type BuilderPrefs } from "./prefsstore";
import { builderPresets, loadBuilderPrompt } from "./promptstore";
import { loadTemplates } from "./templatestore";
import type { IconMapState } from "./iconmapstore";
import { loadArtboards } from "./artboardstore";
import type { FinalArtboard } from "../lib/svgBuilder/artboards";
import type { RowSelection } from "../lib/reviewselect";
import type { SheetTemplate } from "../lib/svgBuilder/templates";

export type BuilderDialog = "none" | "metadata" | "brief" | "preset" | "artboards-metadata";

/** One artboard's exact metadata request: the 768 px JPEG that will be sent. */
export interface ArtboardMetaRequest { id: string; name: string; preview: string }

/** The checked artboards' requests awaiting confirmation (and their progress once sent). */
export interface ArtboardMetaPlan { requests: ArtboardMetaRequest[]; skipped: string[]; done: number; running: boolean }

export interface BuilderKeyInfo {
  value: string | null;
  source: KeySource;
  mask: string;
  title: string;
  note: string;
  keySet: boolean;
}

/** A running (or just finished) Icons indexing pass. */
export interface IndexingState {
  phase: "models" | "icons";
  done: number;
  total: number;
  failed: number;
  model: { file: string; loaded: number; total: number } | null;
}

export interface BuilderModelCheck { state: "idle" | "checking" | "found" | "missing" | "failed"; detail: string }

export interface BuilderModel {
  supported: boolean;
  root: DirHandleLike | null;
  discovery: BuilderDiscovery | null;
  busy: string | null;
  status: string;
  error: boolean;
  config: SheetConfig;
  recipe: SelectionRecipe;
  seed: number;
  lockedIds: readonly string[];
  /** Removed with the artboard ×; kept out of reshuffles until restored (working state, like locks). */
  excludedIds: readonly string[];
  listView: BuilderListView;
  prefs: BuilderPrefs;
  prompt: string;
  presets: readonly PromptPreset[];
  presetPick: string;
  gemini: GeminiConfig;
  key: BuilderKeyInfo;
  modelCheck: BuilderModelCheck;
  metadata: SheetMetadata | null;
  draft: SheetMetadata | null;
  preview: string | null;
  dialog: BuilderDialog;
  svgTexts: Readonly<Record<string, string>>;
  indexing: IndexingState | null;
  /** Saved sheet templates (templatestore.ts) and the one opened for editing, if any. */
  templates: readonly SheetTemplate[];
  editingTemplateId: string | null;
  /** icon-map.json in the scanned root: its path and how many named icons it maps. */
  iconMap: IconMapState | null;
  /** Final artboards (artboardstore.ts), the one on the stage, and the two RULE 25 selections. */
  artboards: readonly FinalArtboard[];
  editingArtboardId: string | null;
  templateSel: RowSelection;
  artboardSel: RowSelection;
  artboardMeta: ArtboardMetaPlan | null;
}

export interface BuilderAction { type: "patch"; patch: Partial<BuilderModel> }

export function initialBuilderModel(): BuilderModel {
  return {
    supported: hasFolderPicker(), root: null, discovery: null, busy: null,
    status: "Open a folder to build from approved SVGs", error: false,
    config: loadSheetConfig(), recipe: DEFAULT_SELECTION_RECIPE, seed: DEFAULT_SEED,
    lockedIds: getAppState().builder.lockedIds ?? [], excludedIds: getAppState().builder.excludedIds ?? [], listView: loadBuilderListView(), prefs: loadBuilderPrefs(),
    prompt: loadBuilderPrompt(), presets: builderPresets.load(), presetPick: "",
    gemini: loadGeminiConfig(), key: emptyKeyInfo(),
    modelCheck: { state: "idle", detail: "" }, metadata: null, draft: null,
    preview: null, dialog: "none", svgTexts: {}, indexing: null,
    ...savedLists(), editingTemplateId: null, iconMap: null,
    editingArtboardId: null, templateSel: EMPTY_SEL, artboardSel: EMPTY_SEL, artboardMeta: null,
  };
}

const EMPTY_SEL: RowSelection = { checked: [], active: null, anchor: null };

/** Templates, then their artboards (an artboard of a removed template is dropped). */
function savedLists(): Pick<BuilderModel, "templates" | "artboards"> {
  const templates = loadTemplates();
  return { templates, artboards: loadArtboards(new Set(templates.map((t) => t.id))) };
}

export function builderReducer(state: BuilderModel, action: BuilderAction): BuilderModel {
  return action.type === "patch" ? { ...state, ...action.patch } : state;
}

export function emptyKeyInfo(): BuilderKeyInfo {
  return { value: null, source: "none", mask: "not set", title: "No Gemini API key yet",
    note: "stored in IndexedDB · masked in the UI · excluded from exports", keySet: false };
}

export function keyInfoOf(read: KeyRead): BuilderKeyInfo {
  const keySet = read.key !== null;
  const source = read.source;
  return {
    value: read.key, source, keySet, mask: keySet ? maskKey(read.key ?? "") : "not set",
    title: titleOf(source, keySet),
    note: noteOf(source, keySet),
  };
}

export function configUndoPatchOf(m: BuilderModel): BuilderUndoPatch {
  return { config: m.config, seed: m.seed, lockedIds: [...m.lockedIds], recipe: m.recipe };
}

export function patchOfConfigUndo(patch: BuilderUndoPatch): Partial<BuilderModel> {
  return { config: patch.config, seed: patch.seed, lockedIds: [...patch.lockedIds], recipe: patch.recipe };
}

function titleOf(source: KeySource, keySet: boolean): string {
  if (!keySet) return source === "unreadable" ? "Storage could not be read" : "No Gemini API key yet";
  if (source === "session") return "Gemini key kept for this session only";
  return "Gemini API key secured locally";
}

function noteOf(source: KeySource, keySet: boolean): string {
  if (source === "unreadable") return "this device's storage is unreadable here (private mode?)";
  if (source === "session") return "browser storage refused it — paste again after a reload";
  if (!keySet) return "paste a key in the editor; it never leaves this device";
  return "stored in IndexedDB · masked in the UI · redacted from logs · excluded from exports";
}

function hasFolderPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}
