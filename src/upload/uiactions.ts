// uiactions.ts — the "SVG to upload" tab's UI actions that are neither settings
// nor batch runs (RULE 24): the checkbox selection and the active row (session
// persisted, never on the undo timeline — design §6 records only
// `uploadSettings` entries for this tab), the dialog open/dismiss, and the
// metadata copy-to-clipboard with its honest fallback.

import { useCallback, useRef } from "react";
import type { IconMetadata } from "../lib/upload/meta";
import { getAppState, patchUpload } from "../state/appstore";
import type { UploadActions, UploadCtx } from "./actions";

/** The selection/dialog/clipboard hooks' share of the action surface. */
type UiSlice = Pick<UploadActions,
  "toggleCheck" | "selectVisible" | "deselectAll" | "setActive" | "openSettings" | "dismissDialog" | "copyMeta">;

export function useUiActions(ctx: UploadCtx): UiSlice {
  return { ...useSelectActions(ctx), ...useDialogActions(ctx), ...useCopyActions(ctx) };
}

/**
 * The checkbox selection and the active row. Session-persisted (they survive a
 * restart) but NOT on the undo timeline — design §6 records only
 * `uploadSettings` entries for this tab, the same class as the tab switch.
 */
function useSelectActions(ctx: UploadCtx): Pick<UiSlice,
  "toggleCheck" | "selectVisible" | "deselectAll" | "setActive"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const toggleCheck = useCallback((id: string) => {
    const checked = getAppState().upload.checked;
    const ids = checked.includes(id) ? checked.filter((x) => x !== id) : [...checked, id];
    patchUpload({ checked: ids });
  }, []);
  const selectVisible = useCallback(() => {
    const c = latest.current;
    patchUpload({ checked: [...new Set([...c.checked, ...c.visible.map((r) => r.source.id)])] });
  }, []);
  const deselectAll = useCallback(() => patchUpload({ checked: [] }), []);
  const setActive = useCallback((id: string) => patchUpload({ activeId: id }), []);
  return { toggleCheck, selectVisible, deselectAll, setActive };
}

function useDialogActions(ctx: UploadCtx): Pick<UiSlice, "openSettings" | "dismissDialog"> {
  const latest = useRef(ctx);
  latest.current = ctx;
  const openSettings = useCallback((id: string | null) => {
    latest.current.dispatch({ type: "dialog", dialog: { kind: "settings", id } });
  }, []);
  const dismissDialog = useCallback(() => latest.current.dispatch({ type: "dialog", dialog: null }), []);
  return { openSettings, dismissDialog };
}

/** One metadata field → the clipboard, with the honest fallback (RULE 9). */
function useCopyActions(ctx: UploadCtx): Pick<UiSlice, "copyMeta"> {
  const latest = useRef(ctx);
  latest.current = ctx;
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
