// EditSettingsButton.tsx — "Edit settings" in Generate SVG (2026-11-06): a
// small popup with the anchor point size in screen pixels, used by the path
// editor and the Ctrl-hover anchor dots, and the click tolerance for picking
// a (thin) shape by a single click. Saved on this device at once.

import { useRef, useState } from "react";
import { useDismiss } from "../ui/usedismiss";
import { ANCHOR_PX_MAX, ANCHOR_PX_MIN, PICK_PX_MAX, PICK_PX_MIN, setEditSettings, useEditSettings } from "./editsettings";

export default function EditSettingsButton() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const close = useRef(() => setOpen(false)).current;
  useDismiss(box, open, close);
  return (
    <div className="svg-edit-settings" ref={box}>
      <button type="button" className="svg-btn" data-testid="svg-edit-settings" aria-expanded={open}
        title="Settings of the SVG anchor views (the editor and Ctrl + hover)" onClick={() => setOpen((o) => !o)}>⚙ Edit settings</button>
      {open && <EditSettingsPop onClose={close} />}
    </div>
  );
}

function EditSettingsPop({ onClose }: { onClose: () => void }) {
  const { anchorPx, pickPx } = useEditSettings();
  return (
        <div className="svg-edit-settings-pop" role="dialog" aria-label="Edit settings" data-testid="svg-edit-settings-dialog">
          <label className="svg-field">
            <span className="svg-label">Anchor point size (px)</span>
            <input className="svg-input" type="number" min={ANCHOR_PX_MIN} max={ANCHOR_PX_MAX} step={1}
              data-testid="svg-edit-anchor-px" value={anchorPx}
              onChange={(e) => setEditSettings({ anchorPx: Number(e.target.value) })} />
          </label>
          <label className="svg-field">
            <span className="svg-label">Click tolerance to select a shape (px)</span>
            <input className="svg-input" type="number" min={PICK_PX_MIN} max={PICK_PX_MAX} step={1}
              data-testid="svg-edit-pick-px" value={pickPx}
              onChange={(e) => setEditSettings({ pickPx: Number(e.target.value) })} />
          </label>
          <small>Screen pixels, the same at any zoom. Anchors {ANCHOR_PX_MIN}–{ANCHOR_PX_MAX} (handles a little smaller); a single click this close to a shape's line selects it ({PICK_PX_MIN}–{PICK_PX_MAX}).</small>
          <button type="button" className="svg-btn tiny" data-testid="svg-edit-settings-close" onClick={onClose}>Close</button>
        </div>
  );
}
