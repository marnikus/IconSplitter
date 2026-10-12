// uiactions.ts — SVG to upload tab UI actions
import { useCallback, useRef } from "react";
import type { IconMetadata } from "../lib/upload/meta";
import { getAppState, patchUpload } from "../state/appstore";
import type { UploadActions, UploadCtx } from "./actions";
type UiSlice = Pick<UploadActions, "toggleCheck" | "selectVisible" | "deselectAll" | "checkActive" | "uncheckActive" | "setActive" | "openSettings" | "dismissDialog" | "copyMeta">;
export function useUiActions(ctx: UploadCtx): UiSlice {
  return { ...useSelectActions(ctx), ...useDialogActions(ctx), ...useCopyActions(ctx) };
}
function useSelectActions(ctx: UploadCtx): Pick<UiSlice, "toggleCheck" | "selectVisible" | "deselectAll" | "checkActive" | "uncheckActive" | "setActive"> {
  const latest = useRef(ctx); latest.current = ctx;
  const toggleCheck = useToggleCheck();
  const selectVisible = useSelectVisible(latest);
  const deselectAll = useDeselectAll();
  const checkActive = useCheckActive();
  const uncheckActive = useUncheckActive();
  const setActive = useSetActive();
  return { toggleCheck, selectVisible, deselectAll, checkActive, uncheckActive, setActive };
}
function useToggleCheck() {
  return useCallback((id: string) => {
    const checked = getAppState().upload.checked;
    const ids = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
    patchUpload({ checked: ids });
  }, []);
}
function useSelectVisible(latest: { current: UploadCtx }) {
  return useCallback(() => {
    const c = latest.current;
    patchUpload({ checked: [...new Set([...c.checked, ...c.visible.map((r) => r.source.id)])] });
  }, []);
}
function useDeselectAll() { return useCallback(() => patchUpload({ checked: [] }), []); }
function useCheckActive() {
  return useCallback(() => {
    const id = getAppState().upload.activeId;
    if (!id) return;
    const checked = getAppState().upload.checked;
    if (checked.includes(id)) return;
    patchUpload({ checked: [...checked, id] });
  }, []);
}
function useUncheckActive() {
  return useCallback(() => {
    const id = getAppState().upload.activeId;
    if (!id) return;
    const checked = getAppState().upload.checked;
    if (!checked.includes(id)) return;
    patchUpload({ checked: checked.filter((x) => x !== id) });
  }, []);
}
function useSetActive() { return useCallback((id: string) => patchUpload({ activeId: id }), []); }
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
    const text = metaText(meta, field);
    void navigator.clipboard.writeText(text)
      .then(() => c.say(`${field === "tags" ? "Tags" : field === "title" ? "Title" : "Description"} copied`))
      .catch(() => c.say("The clipboard is blocked — select the text and copy it by hand", true));
  }, []);
  return { copyMeta };
}
function metaText(meta: IconMetadata, field: "title" | "description" | "tags"): string {
  if (field === "title") return meta.title;
  return field === "description" ? meta.description : meta.tags.join(", ");
}
