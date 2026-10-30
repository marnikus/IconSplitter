// Format choices share the existing inherited/global/local settings write path.
import { hasOutputFormats, NO_OUTPUT_FORMATS } from "../lib/upload/formats";
import { ToggleSetting, type SettingsFieldProps } from "./settingsfield";
import { ConverterSetting } from "./UploadEpsSettings";

export default function UploadFormatSettings({ p, effective }: SettingsFieldProps) {
  return <>
    <ToggleSetting p={p} effective={effective} field="includeSvg" label="Export SVG" testid="svg"
      hint="unchecked: no SVG file is written or included in the next exported package" />
    <ToggleSetting p={p} effective={effective} field="includeJpeg" label="Export JPEG" testid="jpeg"
      hint="unchecked: no JPEG is rendered, written or included in the next exported package" />
    <ToggleSetting p={p} effective={effective} field="includeEps" label="Also write EPS" testid="eps"
      hint="a genuine EPS; the converter below writes it, and anything it cannot write fails that stage honestly" />
    <ConverterSetting p={p} effective={effective} />
    {!hasOutputFormats(effective) && <small className="svg-error" role="alert" data-testid="upload-set-formats-warning">{NO_OUTPUT_FORMATS}. The previous package is kept unchanged.</small>}
  </>;
}
