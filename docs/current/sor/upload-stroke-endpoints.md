# Upload stroke endpoints

Part of [Export settings](upload-settings.md) and [EPS](upload-eps.md).

## User contract

**Stroke endpoints** is a single select in both Export settings scopes:

- **Keep source** (`strokeLinecap: "source"`, default): retain each stroke's
  original caps, including round, butt and square, with SVG inheritance and
  local inline-style precedence. The setting does not alter joins.
- **Cut (butt)** (`"butt"`): force flat endpoints on every visible stroke.
- **Rounded** (`"round"`): force round endpoints on every visible stroke.

This is one export-wide policy, not an EPS-only effect. The live preview, SVG,
JPEG input and EPS consume the same prepared artwork. Size-guide replicas and
badge handles follow it too. Filled-only shapes and hidden content are not
restroked. The approved source on disk is never edited.

Global changes update defaults, not any row's pins or decoration enable flags.
A direct change in an icon's own Settings pins the field there, with the usual
inherited/overridden marker and one discrete undo/redo entry per selection.
Reset to inherited drops the row pin. All default restores Keep source; forcing
either mode disables byte-for-byte as-is export even if the other fields are
default. Existing saved settings without this field load Keep source; invalid
pins are dropped. All source-mode settings fingerprints remain backward stable;
each forced mode gets its own fingerprint, refreshing previews and packages.

## Geometry and EPS

`restyle.ts` applies caps on stroked shapes after the geometry bake, before
expansion and measurement. Inline caps are removed before writing the chosen
attribute. The placement loop therefore accounts for endpoint reach and keeps
artwork inside the final artboard. Size-guide snapshots inherit the already
chosen caps. `cornerbadge.ts` applies the choice to its six handles before its
own expansion and artboard-fit check. Keep source retains the supplied badge.

The native writer's `epspaint.strokeOf` translates parent PostScript cap/join
numbers back into SVG inheritance values; it must never reset a child to the
initial butt/miter values. Local attributes/styles still override inherited
paint. Native writer identity is `builtin-vector-4`, invalidating cached EPS
written before the inheritance correction. Strict vector-only EPS audits are
unchanged; no raster fallback or separately installed program is introduced.

## Owners and tests

- `src/lib/upload/strokecaps.ts`: mode validation and explicit shape cap writes.
- `settings.ts`, `settingsfingerprint.ts`, `asis.ts`: settings lifecycle.
- `restyle.ts`, `cornerbadge.ts`, `prepare.ts`: pre-expansion cap application.
- `epspaint.ts`, `epsconv/builtin.ts`: source-faithful EPS and cache identity.
- `src/upload/UploadStrokeCapsSetting.tsx`: shared scope-aware select;
  `overrideactions.ts` records the actual redo value, `settingsgestures.ts`
  treats endpoint selects as discrete gestures.
- `tests/upload_strokecaps.test.ts`: inherited/style/local/square cap and join
  PostScript operators, validation/persistence/equality/fingerprints/as-is,
  decoration overrides, bounds and expanded vector output.
- `tests/upload_live_preview.test.tsx`: both scopes, live preview, pin/reset,
  row undo/redo, All default and no global-created row pins.
- `tests/upload_runexport.test.ts`: final saved SVG/EPS and actual JPEG renderer
  input agree in all three modes; source bytes remain unchanged.

## Selectors

`upload-set-linecap` is the labelled native select **Stroke endpoints** (same
`id` for its label). Values are `source`, `butt`, `round` in that order.
`upload-set-marker-linecap` shows inherited/overridden in the icon scope only.
See the [settings dialog handles](../selectors/upload-dialogs.md).
