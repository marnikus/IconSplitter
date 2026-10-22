import { useState } from "react";
import UploadBadgeTemplateDialog from "./UploadBadgeTemplateDialog";
import { change, Marker, type SettingsFieldProps } from "./settingsfield";

/** The template follows the same global-default / local-pin scope as badge placement. */
export default function UploadBadgeTemplateSetting({ p, effective }: SettingsFieldProps) {
  const [open, setOpen] = useState(false);
  return <div className="svg-field up-set-field">
    <span className="svg-label">Badge SVG template<Marker p={p} field="badgeTemplateSvg" testid="badge-template" /></span>
    <button type="button" className="svg-btn" data-testid="upload-badge-template-edit"
      onClick={(e) => { e.currentTarget.focus(); setOpen(true); }}>Edit SVG template…</button>
    <small className="up-hint">{effective.badgeTemplateSvg ? "Custom SVG" : "Default: EDITABLE STROKE WIDTH"} · saved locally</small>
    {open && <UploadBadgeTemplateDialog source={effective.badgeTemplateSvg} scope={p.scope}
      onClose={() => setOpen(false)} onApply={(svg) => { change(p, "badgeTemplateSvg", svg); setOpen(false); }} />}
  </div>;
}
