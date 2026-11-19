// Format choices share the existing inherited/global/local settings write path.
// 2026-11-19: the rows themselves are the builder dialog's too — one set of
// delivery/JPEG/transform groups in ui/exportrows.tsx, wired here to the
// scope's `changeMany` and to the inherited/overridden marker.
import type { ArtboardBox } from "../lib/exportformats";
import { artboardSize, type UploadSettings } from "../lib/upload/settings";
import { FormatDeliveryRows, FormatJpegRows, FormatOffWarning, FormatTransformRows } from "../ui/exportrows";
import { Marker, changeMany, type SettingsFieldProps } from "./settingsfield";

/** The wiring: the upload scope's write path plus its per-field marker. */
function wiringOf({ p, effective }: SettingsFieldProps) {
  return {
    prefix: "upload-set" as const,
    value: effective,
    onChange: (patch: Partial<UploadSettings>) => changeMany(p, patch),
    marker: (field: keyof UploadSettings, id: string) => <Marker p={p} field={field} testid={id} />,
  };
}

export default function UploadFormatSettings(p: SettingsFieldProps) {
  const w = wiringOf(p);
  return <>
    <FormatDeliveryRows w={w} />
    <FormatOffWarning w={w} />
  </>;
}

/**
 * The JPEG rows. A pinned artboard creates the match/MP question, and typing a
 * resolution is the user deciding for the megapixels — one gesture, so it also
 * unticks "same size as the artboard" (the upload scope's own rule since
 * 2026-10-08). With the artboard hugging the artwork, the match box is not
 * asked at all and the note says the resolution is what the file gets.
 */
export function UploadJpegSettings({ p, effective }: SettingsFieldProps) {
  const pinned = artboardSize(effective.artboard);
  const base = wiringOf({ p, effective });
  const onChange = (patch: Partial<UploadSettings>) =>
    changeMany(p, pinned !== null && patch.jpegMegapixels !== undefined ? { ...patch, jpegMatchArtboard: false } : patch);
  const w = pinned === null ? base : { ...base, onChange };
  return <>
    <FormatJpegRows w={w} artboard={pinned ?? { width: 0, height: 0 }} showMatch={pinned !== null}
      note={pinned === null ? undefined : mpNote(pinned, effective.jpegMatchArtboard)} />
    <small className="up-hint" data-testid="upload-set-mp-note">
      {pinned === null ? "rendered from the vectors at this resolution (default 15.1)" : mpNote(pinned, effective.jpegMatchArtboard)}
    </small>
  </>;
}

/** What the JPEG will really be, given the artboard and the resolution choice. */
function mpNote(pinned: ArtboardBox, match = true): string {
  return match
    ? `the JPEG is the artboard itself: ${pinned.width}×${pinned.height} px — untick for a bigger file`
    : "rendered from the vectors at this resolution, at the artboard's aspect ratio";
}

/** SVGO, stroke/text expansion and the full-artboard rescale. */
export function UploadTransformSettings(p: SettingsFieldProps) {
  return <FormatTransformRows w={wiringOf(p)} />;
}
