// statemodel.ts — the Generate SVG tab's state model (RULE 3/24).
// Owns: one plain-data snapshot of everything the panel renders, the actions
// that change it, and a table-driven reducer. Pure data + a pure reducer keeps
// the rules testable without a DOM and keeps the hook itself tiny.

import type { KeySource } from "../lib/keyvault";
import { useReducer, type Dispatch } from "react";
import type { SvgConfig } from "../lib/svgconfig";
import {
  DEFAULT_PARAMS,
  capsFor,
  type CatalogModel,
  type ModelCaps,
  type SamplingParams,
} from "../lib/modelcaps";
import { ALL_SVG_FILTER, type SvgListFilter, type SvgSort } from "../lib/svglist";
import type { PreviewBackground } from "../lib/svgbackground";
import type { Discovery } from "./sources";
import type { QueueItem } from "./runqueue";
import type { Dialog, RunProgress, SvgRow } from "./types";
import { sortedIds } from "./rowmodel";
import { NO_CHAIN, type Chain } from "./runtotals";

export interface Toast {
  msg: string;
  err?: boolean;
}

/** Everything the Generate SVG panel shows, in one snapshot. */
export interface SvgModel {
  rootName: string;
  rows: SvgRow[];
  discovery: Discovery | null;
  busy: string | null;
  toast: Toast | null;
  config: SvgConfig;
  /** Sampling values for the selected model — never a value it refuses. */
  params: SamplingParams;
  /** What the selected model accepts (lib/modelcaps), for the controls and the payload. */
  caps: ModelCaps;
  /** Requesty's model list when it has been read; null = family rules only. */
  catalog: CatalogModel[] | null;
  /** Warning shown until dismissed: what a model change had to reset. */
  paramNote: string | null;
  prompt: string;
  /** Masked key for display; the key itself lives in svg/keystore. */
  keyMask: string;
  keySet: boolean;
  /** Where the key in hand came from: the device, this session, or nowhere. */
  keySource: KeySource;
  /** Bumped by every pick and scan so a preview cannot outlive its folder. */
  rootToken: number;
  thumb: number;
  /** false while the provider card is minimized to its header line. */
  providerOpen: boolean;
  /** Preview-frame background — an app setting, never part of an SVG. */
  bg: PreviewBackground;
  filter: SvgListFilter;
  sort: SvgSort;
  /**
   * The pinned list order (2026-10-08): refreshed by a scan, a sort change and
   * `repin` (a tab re-activation) — never by a run event, so a landing result
   * cannot move a row while the user looks at the list.
   */
  order: string[];
  dialog: Dialog | null;
  progress: RunProgress | null;
  /** Done/failed of the runs before `progress` in the same queue chain (2026-10-08). */
  chain: Chain;
  running: boolean;
  /** Batches waiting for their turn (I-53); the ref is the authority. */
  queue: QueueItem[];
}

export type SvgAction =
  | { type: "root"; name: string }
  | { type: "rows"; rows: SvgRow[] }
  | { type: "rows-fn"; fn: (rows: SvgRow[]) => SvgRow[] }
  | { type: "discovery"; discovery: Discovery | null }
  | { type: "busy"; busy: string | null }
  | { type: "toast"; toast: Toast | null }
  | { type: "config"; config: SvgConfig }
  | { type: "params"; params: SamplingParams }
  | { type: "caps"; caps: ModelCaps }
  | { type: "catalog"; catalog: CatalogModel[] | null }
  | { type: "param-note"; note: string | null }
  | { type: "prompt"; prompt: string }
  | { type: "key"; key: string | null; source?: KeySource }
  | { type: "root-token" }
  | { type: "thumb"; px: number }
  | { type: "provider-open"; open: boolean }
  | { type: "bg"; bg: PreviewBackground }
  | { type: "filter"; patch: Partial<SvgListFilter> }
  | { type: "sort"; sort: SvgSort }
  | { type: "repin" }
  | { type: "dialog"; dialog: Dialog | null }
  | { type: "progress"; progress: RunProgress | null }
  | { type: "chain"; chain: Chain }
  | { type: "progress-fn"; fn: (p: RunProgress | null) => RunProgress | null }
  | { type: "running"; running: boolean }
  | { type: "queue"; queue: QueueItem[] };

/** Table-driven: one handler per action, so no branch chain can grow (RULE 19). */
const HANDLERS: Record<SvgAction["type"], (m: SvgModel, a: SvgAction) => SvgModel> = {
  root: (m, a) => ({ ...m, rootName: (a as { name: string }).name, rootToken: m.rootToken + 1 }),
  rows: (m, a) => repinned({ ...m, rows: (a as { rows: SvgRow[] }).rows }),
  "rows-fn": (m, a) => ({ ...m, rows: (a as { fn: (r: SvgRow[]) => SvgRow[] }).fn(m.rows) }),
  discovery: (m, a) => ({ ...m, discovery: (a as { discovery: Discovery | null }).discovery }),
  busy: (m, a) => ({ ...m, busy: (a as { busy: string | null }).busy }),
  toast: (m, a) => ({ ...m, toast: (a as { toast: Toast | null }).toast }),
  config: (m, a) => ({ ...m, config: (a as { config: SvgConfig }).config }),
  params: (m, a) => ({ ...m, params: (a as { params: SamplingParams }).params }),
  caps: (m, a) => ({ ...m, caps: (a as { caps: ModelCaps }).caps }),
  catalog: (m, a) => ({ ...m, catalog: (a as { catalog: CatalogModel[] | null }).catalog }),
  "param-note": (m, a) => ({ ...m, paramNote: (a as { note: string | null }).note }),
  prompt: (m, a) => ({ ...m, prompt: (a as { prompt: string }).prompt }),
  key: (m, a) => keyModel(m, (a as { key: string | null }).key, (a as { source?: KeySource }).source),
  "root-token": (m) => ({ ...m, rootToken: m.rootToken + 1 }),
  thumb: (m, a) => ({ ...m, thumb: (a as { px: number }).px }),
  "provider-open": (m, a) => ({ ...m, providerOpen: (a as { open: boolean }).open }),
  bg: (m, a) => ({ ...m, bg: (a as { bg: PreviewBackground }).bg }),
  filter: (m, a) => ({ ...m, filter: { ...m.filter, ...(a as { patch: Partial<SvgListFilter> }).patch } }),
  sort: (m, a) => repinned({ ...m, sort: (a as { sort: SvgSort }).sort }),
  repin: (m) => repinned(m),
  dialog: (m, a) => ({ ...m, dialog: (a as { dialog: Dialog | null }).dialog }),
  progress: (m, a) => ({ ...m, progress: (a as { progress: RunProgress | null }).progress }),
  chain: (m, a) => ({ ...m, chain: (a as { chain: Chain }).chain }),
  "progress-fn": (m, a) => ({ ...m, progress: (a as { fn: (p: RunProgress | null) => RunProgress | null }).fn(m.progress) }),
  running: (m, a) => ({ ...m, running: (a as { running: boolean }).running }),
  queue: (m, a) => ({ ...m, queue: (a as { queue: QueueItem[] }).queue }),
};

export function reduceState(model: SvgModel, action: SvgAction): SvgModel {
  return HANDLERS[action.type](model, action);
}

/** The pin is the sort's order over every row at this moment. */
function repinned(m: SvgModel): SvgModel {
  return { ...m, order: sortedIds(m.rows, m.sort) };
}

/**
 * The key's display state. `keySource` travels WITH the key: a key that came
 * from the session (storage refused the write) or a store that could not be
 * read must never look like the ordinary "secured locally" case, and a failed
 * read must never look like "no key yet".
 */
function keyModel(model: SvgModel, key: string | null, source?: KeySource): SvgModel {
  const from = source ?? (key === null ? "none" : "device");
  return { ...model, keySet: key !== null, keyMask: key ? mask(key) : "not set", keySource: from };
}

/** Masks the middle of a key; the key itself never enters the model. */
function mask(key: string): string {
  if (key.length <= 12) return "•".repeat(key.length);
  return `${key.slice(0, 8)}${"•".repeat(10)}${key.slice(-4)}`;
}

/** The persisted view values a fresh tab opens with (RULE 13: already parsed). */
export interface ViewPrefs {
  thumb: number;
  providerOpen: boolean;
  bg: PreviewBackground;
}

/** The model a fresh tab opens with (persisted values are merged in boot). */
export function initialModel(config: SvgConfig, prompt: string, prefs: ViewPrefs): SvgModel {
  return {
    rootName: "", rows: [], discovery: null, busy: null, toast: null,
    config, params: { ...DEFAULT_PARAMS }, caps: capsFor(config.model), catalog: null, paramNote: null,
    prompt, keyMask: "not set", keySet: false, keySource: "none", rootToken: 0,
    thumb: prefs.thumb, providerOpen: prefs.providerOpen, bg: prefs.bg,
    filter: ALL_SVG_FILTER, sort: "date", order: [], dialog: null, progress: null, chain: NO_CHAIN, running: false, queue: [],
  };
}

/** One hook, one line of state: the panel never holds a second copy. */
export function useSvgModel(config: SvgConfig, prompt: string, prefs: ViewPrefs): [SvgModel, Dispatch<SvgAction>] {
  return useReducer(reduceState, config, (c) => initialModel(c, prompt, prefs));
}
