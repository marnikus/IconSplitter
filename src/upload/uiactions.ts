// uiactions.ts — SVG to upload tab UI actions
import { useCallback, useRef } from "react";
import { applyRowGesture, sameRowSelection, setChecked, toggleChecked, type RowSelection, type SelectIntent } from "../lib/reviewselect";
import { copyMetadataField } from "./metacopy";
import { selectionPayloads } from "../lib/selectiondelta";
import { getAppState, patchUpload } from "../state/appstore";
import type { UploadActions, UploadCtx } from "./actions";
type UiSlice = Pick<UploadActions, "toggleCheck" | "selectVisible" | "uncheckVisible" | "deselectAll" | "checkActive" | "uncheckActive" | "selectRow" | "setActive" | "openSettings" | "dismissDialog" | "copyMeta">;
export function useUiActions(ctx: UploadCtx): UiSlice {
  return { ...useSelectActions(ctx), ...useDialogActions(ctx), ...useCopyActions(ctx) };
}
function useSelectActions(ctx: UploadCtx): Pick<UiSlice, "toggleCheck" | "selectVisible" | "uncheckVisible" | "deselectAll" | "checkActive" | "uncheckActive" | "selectRow" | "setActive"> {
  const latest = useRef(ctx); latest.current = ctx;
  return {
    toggleCheck: useToggleCheck(latest), selectVisible: useSelectVisible(latest),
    uncheckVisible: useUncheckVisible(latest), deselectAll: useDeselectAll(latest),
    checkActive: useCheckActive(latest), uncheckActive: useUncheckActive(latest),
    selectRow: useSelectRow(latest), setActive: useSetActive(latest),
  };
}
function currentSelection(): RowSelection {
  const { checked, activeId, anchorId } = getAppState().upload;
  return { checked, active: activeId, anchor: anchorId };
}
/** One gesture = one entry holding the DIFF (lib/selectiondelta). `gesture`
 *  collapses an Up/Down burst instead of writing a full entry per key. */
function editSelection(c: UploadCtx, after: RowSelection, label: string, gesture?: string): void {
  const before = currentSelection();
  if (sameRowSelection(before, after)) return;
  patchUpload({ checked: after.checked, activeId: after.active, anchorId: after.anchor });
  const payload = selectionPayloads(before, after);
  const record = gesture === undefined ? c.hist.push : c.hist.pushGesture;
  record({
    type: "uploadChecked", label, origin: getAppState().tab,
    ...(gesture === undefined ? {} : { gesture }),
    ids: payload.ids, before: payload.before, after: payload.after,
  });
}
function useToggleCheck(latest: { current: UploadCtx }) {
  return useCallback((id: string) => {
    const before = currentSelection();
    editSelection(latest.current, { ...before, checked: toggleChecked(before.checked, id) }, "Toggle row");
  }, [latest]);
}
function useSelectVisible(latest: { current: UploadCtx }) {
  return useCallback(() => {
    const before = currentSelection();
    const ids = latest.current.visible.map((r) => r.source.id);
    editSelection(latest.current, { ...before, checked: setChecked(before.checked, ids, true) }, "Select visible");
  }, [latest]);
}
function useUncheckVisible(latest: { current: UploadCtx }) {
  return useCallback(() => {
    const before = currentSelection();
    const ids = latest.current.visible.map((r) => r.source.id);
    editSelection(latest.current, { ...before, checked: setChecked(before.checked, ids, false) }, "Deselect visible");
  }, [latest]);
}
function useDeselectAll(latest: { current: UploadCtx }) {
  return useCallback(() => {
    const before = currentSelection();
    editSelection(latest.current, { ...before, checked: [] }, "Deselect all");
  }, [latest]);
}
function useCheckActive(latest: { current: UploadCtx }) {
  return useCallback(() => {
    const before = currentSelection();
    if (!before.active) return;
    editSelection(latest.current, { ...before, checked: setChecked(before.checked, [before.active], true) }, "Select active row");
  }, [latest]);
}
function useUncheckActive(latest: { current: UploadCtx }) {
  return useCallback(() => {
    const before = currentSelection();
    if (!before.active) return;
    editSelection(latest.current, { ...before, checked: setChecked(before.checked, [before.active], false) }, "Deselect active row");
  }, [latest]);
}
function useSelectRow(latest: { current: UploadCtx }) {
  return useCallback((id: string, intent: SelectIntent) => {
    const before = currentSelection();
    const visibleIds = latest.current.visible.map((r) => r.source.id);
    const after = applyRowGesture(before, { id, intent, visibleIds });
    editSelection(latest.current, after, intent === "replace" ? "Select row" : "Select range");
  }, [latest]);
}
function useSetActive(latest: { current: UploadCtx }) {
  return useCallback((id: string) => {
    const before = currentSelection();
    editSelection(latest.current, { ...before, active: id }, "Move active row", "active");
  }, [latest]);
}
function useDialogActions(ctx: UploadCtx): Pick<UiSlice, "openSettings" | "dismissDialog"> {
  const latest = useRef(ctx); latest.current = ctx;
  const openSettings = useCallback((id: string | null) => {
    latest.current.dispatch({ type: "dialog", dialog: { kind: "settings", id } });
  }, []);
  const dismissDialog = useCallback(() => latest.current.dispatch({ type: "dialog", dialog: null }), []);
  return { openSettings, dismissDialog };
}
function useCopyActions(ctx: UploadCtx): Pick<UiSlice, "copyMeta"> {
  const latest = useRef(ctx); latest.current = ctx;
  const copyMeta = useCallback((id: string, field: "title" | "description" | "tags") => {
    const c = latest.current;
    const meta = c.rows.find((r) => r.source.id === id)?.meta.metadata ?? null;
    if (meta === null) return c.say("Nothing to copy yet — generate metadata first", true);
    void copyMetadataField(meta, field, c.say);
  }, []);
  return { copyMeta };
}
