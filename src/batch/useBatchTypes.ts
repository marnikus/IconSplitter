// useBatchTypes.ts — shared types for batch orchestration (split to keep files <300 lines)

import type { DirHandleLike } from "../lib/fs";
import type { AiImageEntry } from "../lib/scan";
import type { Box } from "../lib/detect";
import type { SourceStatus } from "../lib/statefile";
import type { StateKey } from "./statewrite";
import type { Preset } from "../lib/presets";
import type { MutableRefObject, SetStateAction, Dispatch } from "react";

export type RowMergeMap = Record<string, number | null>;

export interface Row extends AiImageEntry {
  status: SourceStatus;
  selected: boolean;
}

/** One row's split preview: the icon count, its thumbs and the boxes they came from. */
export interface PreviewEntry {
  relPath: string;
  count: number;
  thumbs: string[];
  boxes: Box[];
  status: "idle" | "loading" | "done" | "error";
  error?: string;
}

/** One row's preview. `explicitMerge` (the row's Apply/Reset click) is the distance
 *  to use for THIS call; omitted means the row's own override decides (RULE 3). */
export type PreviewOne = (row: Row, signal: AbortSignal, explicitMerge?: number | null) => Promise<PreviewEntry>;

export type PreviewSet = Dispatch<SetStateAction<Map<string, PreviewEntry>>>;

export interface BatchState {
  rootName: string;
  destName: string;
  preset: Preset;
  presetNames: string[];
  rows: Row[];
  busy: string | null;
  toast: { msg: string; err?: boolean } | null;
  refWarnings: string[];
  rowMerges: RowMergeMap;
}

export type Setter = React.Dispatch<React.SetStateAction<BatchState>>;

export interface Ctx {
  root: MutableRefObject<DirHandleLike | null>;
  dest: MutableRefObject<DirHandleLike | null>;
  keys: MutableRefObject<StateKey[]>;
  stop: MutableRefObject<boolean>;
  state: MutableRefObject<BatchState>;
}
