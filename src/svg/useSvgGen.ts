// useSvgGen.ts — Generate SVG orchestration (RULE 2/4/5/24).
// Thin on purpose: the rules live in tested modules — discovery in svg/sources,
// sidecar IO in svg/sidecar, validation in lib/svgvalidate, versioning in
// lib/svgfile, the run in svg/runner, lists in lib/svglist, the review decision
// in svg/reviewact and the row model in svg/rowmodel. This file owns only the
// wiring: one reducer for the model (svg/statemodel), one context object for
// the actions (svg/ctx + svg/actions), and the flat API the panel reads.

import { useRef } from "react";
import { fsSupported } from "../batch/picker";
import { loadConfig, loadPrompt } from "./promptstore";
import { loadSvgPrefs } from "./prefsstore";
import { useSvgCtx } from "./ctx";
import { useSvgModel, type SvgModel, type ViewPrefs } from "./statemodel";
import { useSvgActions, type SvgActions, type SvgCtx } from "./actions";

/** What the panel sees: the model plus every action, flattened (RULE 24). */
export type SvgGenApi = SvgModel & SvgActions & {
  supported: boolean;
  provider: string;
  visible: SvgCtx["visible"];
  checked: string[];
  activeId: string | null;
  header: "none" | "some" | "all";
  affected: string[];
  totals: SvgCtx["totals"];
  /** Requests the current selection becomes at the effective per-request size. */
  requests: number;
  refs: SvgCtx["refs"];
  dispatch: SvgCtx["dispatch"];
};

export function useSvgGen(): SvgGenApi {
  const boot = useRef(loadBoot()).current;
  const [model, dispatch] = useSvgModel(boot.config, boot.prompt, boot.prefs);
  const ctx = useSvgCtx(model, dispatch);
  const actions = useSvgActions(ctx);
  const { visible, checked, activeId, header, affected, totals, provider, requests, refs } = ctx;
  return {
    ...model, ...actions, supported: fsSupported(), provider, visible,
    checked, activeId, header, affected, totals, requests, refs, dispatch,
  };
}

interface Boot {
  config: ReturnType<typeof loadConfig>;
  prompt: string;
  prefs: ViewPrefs;
}

/** Values the tab opens with, read once from local storage (RULE 6). */
function loadBoot(): Boot {
  const prefs = loadSvgPrefs();
  const view: ViewPrefs = { thumb: prefs.thumbHeight, providerOpen: prefs.providerOpen, bg: prefs.previewBg };
  return { config: loadConfig(), prompt: loadPrompt(), prefs: view };
}
