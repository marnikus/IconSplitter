import { useState } from "react";
import UploadShadowTemplateDialog from "./UploadShadowTemplateDialog";
import { change, Marker, type SettingsFieldProps } from "./settingsfield";

/** The shadow template follows the same global-default / local-pin scope as the shadow's numbers. */
export default function UploadShadowTemplateSetting({ p, effective }: SettingsFieldProps) {
  const [open, setOpen] = useState(false);
  return <div className="svg-field up-set-field">
    <span className="svg-label">Shadow SVG template<Marker p={p} field="shadowTemplateSvg" testid="shadow-template" /></span>
    <button type="button" className="svg-btn" data-testid="upload-shadow-template-edit"
      onClick={(e) => { e.currentTarget.focus(); setOpen(true); }}>Edit SVG template…</button>
    <small className="up-hint">{effective.shadowTemplateSvg ? "Custom SVG" : "Default: soft ellipse gradient"} · saved locally</small>
    {open && <UploadShadowTemplateDialog source={effective.shadowTemplateSvg} scope={p.scope}
      onClose={() => setOpen(false)} onApply={(svg) => { change(p, "shadowTemplateSvg", svg); setOpen(false); }} />}
  </div>;
}
