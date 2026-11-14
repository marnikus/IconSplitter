// SvgBuilderLeaveDialog.tsx — "Save changes?" before leaving the edited template
// or the open artboard with unsaved edits (2026-11-14): Save, Discard, or Cancel.
import { useEffect } from "react";
import { unsavedSubject } from "./actions/leaveguard";
import type { BuilderApi } from "./useSvgBuilder";

export default function SvgBuilderLeaveDialog({ b }: { b: BuilderApi }) {
  const subject = unsavedSubject({ model: b, placedIds: b.checked });
  const name = subject?.name ?? "this sheet";
  const kind = subject?.kind === "artboard" ? "artboard" : "template";
  const cancel = b.actions.leaveCancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancel]);
  return <div className="bld-backdrop" role="presentation">
    <section className="bld-modal bld-leave" data-testid="builder-leave-dialog" role="alertdialog" aria-modal="true" aria-label="Unsaved template changes">
      <div className="bld-modal-head"><div><span className="bld-eyebrow">UNSAVED CHANGES</span><h3>Save changes to “{name}”?</h3></div></div>
      <p>You changed this {kind}. Save writes the changes into it; Discard leaves it as it was saved.</p>
      <div className="bld-leave-actions">
        <button type="button" className="svg-btn ghost" data-testid="builder-leave-cancel" onClick={cancel}>Cancel</button>
        <button type="button" className="svg-btn" data-testid="builder-leave-discard" onClick={b.actions.leaveDiscard}>Discard</button>
        <button type="button" className="svg-btn primary" data-testid="builder-leave-save" onClick={b.actions.leaveSave} autoFocus>✓ Save</button>
      </div>
    </section>
  </div>;
}
