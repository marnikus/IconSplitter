// A batch's local export style: current global general fields, with each icon's
// current decoration choices preserved. Equal-to-default/off/null values must
// remain explicit pins so later globals cannot change this frozen batch.
import { parseApplied } from "./decorations";
import { parseOverrides, type SettingsOverrides, type UploadSettings } from "./settings";

/** Validated, detached snapshot; nested padding/artboard values are copied by their parsers. */
export function localSettingsSnapshot(defaults: UploadSettings, current: UploadSettings): SettingsOverrides {
  return parseOverrides({ ...defaults, ...parseApplied(current) });
}
