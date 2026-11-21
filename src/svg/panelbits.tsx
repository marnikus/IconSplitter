// panelbits.tsx — the wiring blocks lifted out of SvgPanel (RULE 18 file sizes):
// modals, stable control/bulk-bar callback bridges, and per-row actions.

import { useMemo } from "react";
import type { DirHandleLike } from "../lib/fs";
import type { ReviewStatus } from "../lib/svgfile";
import type { DataRow } from "../lib/getdata";
import { useRowPresentation } from "../ui/rowpresentation";
import type { SvgGenApi } from "./useSvgGen";
import SvgDialogs from "./SvgDialogs";
import { svgPromptWindowOf } from "./SvgPromptZone";
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
      onImageConfirm={g.confirmImageRegen} />
  );
}

/** The row actions, wired straight from the api — one place to read them. */
function rowActionsOf(g: SvgGenApi, rootRef: { current: DirHandleLike | null }): SvgRowActions {
  return {
    activeId: g.activeId, checked: g.checked, thumb: g.thumb, rootToken: g.rootToken, bg: g.bg, rootRef,
    toggleCheck: g.toggleCheck, selectRow: g.selectRow, generate: g.requestGenerate,
    decide: g.decide, remove: g.removeRows, copyCode: g.copyCode, showCode: g.showCode, showHistory: g.showHistory,
    openLocation: g.openLocation,
    requestImageRegen: g.requestImageRegen, setImageVersion: g.setImageVersion, imgRunning: g.imgRunning,
    preferVersion: g.preferVersion,
  };
}

/** Memoized prompt window + stable control callback references for SvgControls. */
export function usePanelControlProps(g: SvgGenApi) {
  const prompt = useMemo(
    () => svgPromptWindowOf(g),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g.prompt, g.presets, g.presetPick, g.setPrompt, g.resetPrompt, g.pickPreset, g.quickLoadPreset, g.deletePreset, g.savePresetAs],
  );
  const cbs = useRowPresentation({
    onChooseRoot: g.chooseRoot, onRescan: g.rescan, onConfig: g.setConfig, onParams: g.setParams,
    onRefreshModels: g.refreshModels, onDismissNote: () => g.dispatch({ type: "param-note", note: null }),
    onSaveKey: g.saveKey, onForgetKey: g.forgetKey, onProviderOpen: g.setProviderOpen,
    onSwitchConnection: g.switchConnection, onAddConnection: g.addConnection, onRemoveConnection: g.removeConnection,
    onConnectionMeta: g.setConnectionMeta, onImage: g.setImage, onFilter: g.setFilter,
    onSort: g.setSort, onSortDir: g.setSortDir,
    onClearFilters: () => g.setFilter({ generation: "all", review: "all", search: "" }),
  });
  return { prompt, cbs };
}

/** Stable bulk-bar callback references so SvgBulkBar skips unrelated renders. */
export function usePanelBulkCallbacks(g: SvgGenApi, getData: () => DataRow[]) {
  return useRowPresentation({
    onToggleAll: (on: boolean) => (on ? g.selectVisible() : g.uncheckVisible()),
    onSelectVisible: g.selectVisible, onInvert: g.invertVisible, onDeselectAll: g.deselectAll,
    onThumb: g.setThumb, onBg: g.setPreviewBg, onStroke: g.setPreviewStroke,
    onGenerate: () => g.requestGenerate(g.checked), onRegenerate: () => g.regenerateSelected(g.checked),
    onImageRegen: () => g.requestImageRegen(g.checked), onImageStop: g.stopImageRegen,
    onDecide: (d: Exclude<ReviewStatus, "pending">) => g.decide(g.affected, d),
    onCancel: g.cancelRun, onRegisterExisting: () => g.registerExisting(g.checked),
    getData, onRegisterImages: () => g.registerImages(g.checked),
    onRemove: () => g.removeRows(g.checked), onCutTails: g.cutTails, onApproveCuts: g.approveCuts,
    onRegisterStyle: () => g.registerStyles(g.checked), onStyle: g.setStyle,
  });
}

export { DialogsBlock as PanelDialogs, rowActionsOf as panelRowActions };
