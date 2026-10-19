// panelbits.tsx — the two wiring blocks lifted out of SvgPanel (RULE 18 file
// sizes): the modal block and the per-row actions object. Pure plumbing —
// every behavior behind these props is tested where it is implemented.

import type { DirHandleLike } from "../lib/fs";
import type { SvgGenApi } from "./useSvgGen";
import SvgDialogs from "./SvgDialogs";
import type { SvgRowActions } from "./SvgRow";

/** All modals, wired once — generation and AI source regeneration alike. */
function DialogsBlock({ g, rootRef }: { g: SvgGenApi; rootRef: { current: DirHandleLike | null } }) {
  return (
    <SvgDialogs dialog={g.dialog} rows={g.rows} config={g.config} caps={g.caps} params={g.params}
      rootRef={rootRef} readCode={g.readCode} presets={g.presets} prompt={g.prompt}
      onConfirm={g.confirmGenerate} onDismiss={g.dismissDialog} onShowCode={g.showCode}
      onUseVersion={g.preferVersion} running={g.running}
      imageConn={g.connections.find((c) => c.id === g.activeConn && c.kind === "image") ?? null}
      onImagePrompt={g.setPrompt}
      onImagePreset={(name) => { const preset = g.presets.find((x) => x.name === name); if (preset !== undefined) g.setPrompt(preset.text); g.pickPreset(name); }}
      onImageConfirm={g.confirmImageRegen} />
  );
}

/** The row actions, wired straight from the api — one place to read them. */
function rowActionsOf(g: SvgGenApi, rootRef: { current: DirHandleLike | null }): SvgRowActions {
  return {
    activeId: g.activeId, checked: g.checked, thumb: g.thumb, rootToken: g.rootToken, bg: g.bg, rootRef,
    toggleCheck: g.toggleCheck, setActive: g.setActive, generate: g.requestGenerate,
    decide: g.decide, copyCode: g.copyCode, showCode: g.showCode, showHistory: g.showHistory,
    openLocation: g.openLocation,
    requestImageRegen: g.requestImageRegen, setImageVersion: g.setImageVersion, imgRunning: g.imgRunning,
    preferVersion: g.preferVersion,
  };
}


/** Shorthand for SvgPanel: the two wiring blocks above. */
export { DialogsBlock as PanelDialogs, rowActionsOf as panelRowActions };
