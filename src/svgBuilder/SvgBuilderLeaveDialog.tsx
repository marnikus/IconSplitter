// SvgBuilderLeaveDialog.tsx — "Save changes to the template?" before leaving a
// changed template (2026-11-14): Save, Discard, or Cancel (stay and keep editing).
import { useEffect } from "react";
import { editedTemplate } from "./actions/leaveguard";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderLeaveDialog({ b }: { b: BuilderApi }) {
  const name = editedTemplate(b)?.name ?? "this template";
  const cancel = b.actions.leaveCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancel]);
  return <div className="bld-backdrop" role="presentation">
    <section className="bld-modal bld-leave" data-testid="builder-leave-dialog" role="alertdialog" aria-modal="true" aria-label="Unsaved template changes">
      <div className="bld-modal-head"><div><span className="bld-eyebrow">UNSAVED CHANGES</span><h3>Save changes to “{name}”?</h3></div></div>
      <p>You changed this template. Save writes the changes into it; Discard leaves it as it was saved.</p>
      <div className="bld-leave-actions">
        <button type="button" className="svg-btn ghost" data-testid="builder-leave-cancel" onClick={cancel}>Cancel</button>
        <button type="button" className="svg-btn" data-testid="builder-leave-discard" onClick={b.actions.leaveDiscard}>Discard</button>
        <button type="button" className="svg-btn primary" data-testid="builder-leave-save" onClick={b.actions.leaveSave} autoFocus>✓ Save</button>
      </div>
    </section>
  </div>;
}
