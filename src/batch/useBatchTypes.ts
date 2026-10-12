// useBatchTypes.ts — shared types for batch orchestration (split to keep files <300 lines)

import type { DirHandleLike } from "../lib/fs";
import type { AiImageEntry } from "../lib/fs";
import type { SourceStatus } from "../lib/status";
import type { Preset } from "../lib/presets";
import type { MutableRefObject } from "react";
import type { BatchProgress } from "./BatchProgress";

export type RowMergeMap = Record<string, number | null>;

export interface Row extends AiImageEntry {
  status: SourceStatus;
  selected: boolean;
}

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
  progress: BatchProgress | null;
  running: boolean;
}

export type Setter = React.Dispatch<React.SetStateAction<BatchState>>;

export interface Ctx {
  root: MutableRefObject<DirHandleLike | null>;
  dest: MutableRefObject<DirHandleLike | null>;
  keys: MutableRefObject<string[]>;
  stop: MutableRefObject<boolean>;
  state: MutableRefObject<BatchState>;
}
