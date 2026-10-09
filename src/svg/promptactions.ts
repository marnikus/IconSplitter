// promptactions.ts — the Generate SVG prompt window's actions (2026-10-09): edit,
// reset to the documented default, and the shared preset gestures from
// ui/presetops over the SVG list (its own key, never the metadata list). The
// same rule as the metadata prompt; only the store and the reducer differ.

import { useMemo, useRef } from "react";
import { log } from "../log/logstore";
import { DEFAULT_SVG_PROMPT } from "../lib/svgprompt";
import { presetActionsOf, type PresetActions } from "../ui/presetops";
import { svgPresets } from "./promptstore";
import type { SvgAction, SvgModel } from "./statemodel";

export interface SvgPromptCtx {
  m: SvgModel;
  dispatch: (a: SvgAction) => void;
  say: (msg: string, err?: boolean) => void;
}

export interface SvgPromptActions extends PresetActions {
  setPrompt: (text: string) => void;
  resetPrompt: () => void;
}

/** The actions over whatever the getter returns now — no stale closure. */
export function svgPromptActionsOf(get: () => SvgPromptCtx): SvgPromptActions {
  const presets = presetActionsOf(() => {
    const c = get();
    return { m: c.m, io: { store: svgPresets, dispatch: c.dispatch, say: c.say } };
  });
  return {
    ...presets,
    setPrompt: (text) => get().dispatch({ type: "prompt", prompt: text }),
    resetPrompt: () => {
      const c = get();
      c.dispatch({ type: "prompt", prompt: DEFAULT_SVG_PROMPT });
      log({ feature: "svg", action: "prompt-reset", detail: "the default prompt was restored" });
      c.say("Default prompt restored");
    },
  };
}

export function useSvgPromptActions(ctx: SvgPromptCtx): SvgPromptActions {
  const latest = useRef(ctx);
  latest.current = ctx;
  return useMemo(() => svgPromptActionsOf(() => latest.current), []);
}
