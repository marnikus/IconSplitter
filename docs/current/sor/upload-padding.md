# Upload padding — four independent sides

Part of [export settings](upload-settings.md) and [geometry](upload-geometry.md).

## Controls and inheritance

The global and per-icon export popups show **Left, Right, Top, Bottom** in a
compact two-column grid instead of a single uniform input. Each percentage is
independent, live and clamped to **0–50%**; clearing a numeric field sets only that
side to 0. Labels target their inputs. Editing one side leaves the others alone.

The existing **Default** button applies to the padding group: on = preserve the
SVG's authored margins, with four blank inputs. Clicking it again starts all four
at 8%. Typing a side while source Default is on starts the untouched sides at 8%,
explicitly shown. **All default (export as is)** also resets the entire group.

Global edits persist as inherited defaults, never pinning checked/unchecked rows
and never changing decoration enablement. A per-icon edit pins the four-value
padding group through the existing override/history path (continuous edits retain
the existing gesture coalescing). The single padding marker says inherited or
overridden; **Reset to inherited** drops that pin along with the icon's other
local pins, without changing defaults or selection-applied decorations.

## Geometry and outputs

- **Content fit:** each margin is its percentage of the final painted artwork's
  largest side (including Shadow when on). The content-hugging artboard includes
  those exact individual margins. A scale-to-MP target grows artwork and all
  four margins by the same factor.
- **Pinned/source-size artboard:** each margin is a percentage of the artboard's
  largest side, preserving the previous unit/basis. A 5500×3100 artboard uses
  5500 as that basis for every side. The icon scales uniformly and centres in
  the remaining inset rectangle, not the entire artboard. Aspect-ratio
  letterboxing may add space beyond the requested margins; no stretching or
  cropping. Insets that leave no usable width or height fail `no-fit`.
- The measured stroke/expansion fitter and bounded wide-stroke fallback use the
  same four margins and inset centre. All four affect preview caching and
  selective re-export. Row text names L/R/T/B while asymmetric.
- Preview, SVG, JPEG raster input and vector EPS share prepared export geometry.
  Original files remain untouched. Source-default/null still retains authored
  margins; fully as-is SVG bytes are unchanged.

## Storage and compatibility

`UploadSettings.paddingPct` accepts a legacy uniform number, source-default
`null`, or `{left,right,top,bottom}`. Equal sides canonicalize to the legacy
number. Existing saved scalar/null settings keep their values, appearance and
fingerprints, including factory `36232c04`; no storage version/key change.
Asymmetric objects validate each default side independently; incomplete/nonfinite
or nonnumeric override objects are ignored rather than pinning junk. Complete
numeric overrides clamp each side independently.

Padding equality compares the four values, not the artboard-object comparator.
Thus changing any one side updates persistence, history and output staleness.
Fingerprints encode sides in fixed L/R/T/B order (three-decimal precision), or
the existing scalar/default token for legacy/equal-sided values. Store ownership:
[upload storage](storage/upload.md).

## Selectors, owners and tests

- `upload-set-padding-group`: control group; no legacy uniform input remains.
- `upload-set-padding-{left,right,top,bottom}`: labelled number inputs with matching
  IDs and accessible names `Left padding %`, `Right padding %`, etc.
- `upload-set-padding-default`: existing button; `aria-pressed` while null.
- `upload-set-marker-padding`: existing per-icon inherited/overridden marker.

Domain: `src/lib/upload/padding.ts`, `settings.ts`, `settingsfingerprint.ts`.
Geometry: `geom.ts` (`paddingBox`), `place.ts`, `placefallback.ts` in that directory.
UI: `src/upload/UploadPaddingSetting.tsx`, `UploadSettingsDialog.tsx`, `UploadRow.tsx`.

Tests: `tests/upload_padding_sides.test.ts` (legacy/validation/equality/hash,
content/pinned/MP fits, strokes/expansion/Shadow/no-fit, supplied wide-stroke SVGs),
`tests/upload_padding_sides_ui.test.tsx` (both scopes and independent edits),
`tests/upload_padding_sides_export.test.ts` (actual supplied stock fixture through
SVG/JPEG/vector EPS, unchanged originals and selective re-export), and
`tests/upload_live_preview.test.tsx` (live preview, persistence/reload, undo/redo,
Reset). Existing `tests/upload_ui.test.tsx` interactions now edit Left, keeping
unchanged-side, selection/reset and undo assertions rather than a removed uniform
input. JPEG tests inject only the canvas/encoder transport; they do not claim
real-browser raster visual validation or Adobe ingestion acceptance.
