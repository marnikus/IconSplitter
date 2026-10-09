// promptactions.ts — the metadata prompt panel's actions (RULE 13/24): edit and
// reset to the documented default, plus the shared preset gestures (pick,
// Quick load, Delete, Save as) from ui/presetops. Every action writes through
// promptstore, so the panel's state and the stored payload cannot disagree, and
// the prompt the ONE confirmed request carries is always exactly what the editor shows.

import { useCallback, useRef, type Dispatch } from "react";
import { DEFAULT_METADATA_PROMPT } from "../lib/upload/meta";
import { usePresetActions, type PresetActions } from "../ui/presetops";
import { uploadPresets } from "./promptstore";
import type { UploadAction, UploadModel } from "./statemodel";

/** Only what these actions need: the model, the dispatch and the one say line. */
export interface PromptCtx {
  m: UploadModel;
  dispatch: Dispatch<UploadAction>;
  say: (msg: string, err?: boolean) => void;
}

export interface PromptActions extends PresetActions {
  setPrompt: (text: string) => void;
  resetPrompt: () => void;
}

export function usePromptActions(ctx: PromptCtx): PromptActions {
  const latest = useRef(ctx);
  latest.current = ctx;
  const presets = usePresetActions(ctx.m, { store: uploadPresets, dispatch: ctx.dispatch, say: ctx.say });
  return {
    ...presets,
    setPrompt: useCallback((text: string) => latest.current.dispatch({ type: "prompt", prompt: text }), []),
    resetPrompt: useCallback(() => {
      latest.current.dispatch({ type: "prompt", prompt: DEFAULT_METADATA_PROMPT });
      latest.current.say("Metadata prompt reset to the default");
    }, []),
  };
}
