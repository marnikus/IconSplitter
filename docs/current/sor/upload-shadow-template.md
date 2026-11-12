# Upload shadow SVG template (2026-11-08)

Part of [export settings](upload-settings.md). The shadow under an icon is a
user-editable SVG, set the same way as the [badge template](upload-badge.md):
**Settings → Shadow → Edit SVG template…**, in the global defaults or pinned to
one icon. Empty (the default) is the bundled `svg/templates/shadow.svg`.

## What a shadow template is

Any complete vector SVG with a viewBox — a path, basic shapes, groups, flat fills,
bounding-box (`objectBoundingBox`) linear/radial gradients, strokes. It is checked
by the badge's validator (`validateShadowTemplate` → `validateBadgeTemplate`): the
safety allowlist (no text, images, scripts, event handlers or external
references; whole documents are refused, never stripped; 200 000 characters), the
geometry entirely inside the viewBox, and writable by the built-in EPS writer — so
what passes also exports as SVG, JPEG and EPS. Not supported (the same as the
badge): `userSpaceOnUse` gradients (the bake cannot re-map them — the editor says
so and suggests a flat fill or a bounding-box gradient), clip paths, masks,
filters, patterns.

## How it is placed

`customshadow.ts` copies the template like the badge's: baked by one uniform
matrix into a rectangle (no transform reaches the file), ids isolated, paint kept.
The rectangle is **`shadowWidthPct` of the shipped icon's width** (the template's
viewBox proportions preserved), **centred on the icon**, with its top **`shadowGapPct`
of the icon's height below the icon's bottom edge**. It sits BEHIND the icon and the
artboard fit measures it, as it did the bundled ellipse. With the Expand-strokes
setting on, the shadow's strokes expand too.

Stroke definitions never mix: `hoistAroundShadow` lifts a custom shadow out while
the file's one stroke definition is hoisted for the icon, then puts it back with its
OWN stroke definition (a fill-only shadow is `stroke="none"`). The bundled ellipse is
explicitly stroke-free, as before.

## Where it lives

* Setting `shadowTemplateSvg` (`""` = bundled): a shadow decoration field
  (`decorations.ts`), an override, one undo gesture (`settingsgestures.ts`).
  Persisted data costs only this field: invalid code reads back as the default;
  valid code is stored canonical; the bundled code reads back as `""`.
* The bundled shadow keeps its own path (`shadow.ts`, the ellipse with its
  user-space gradient normalised): its output is byte-identical to before the setting
  existed, and `settingsFingerprint` keeps its old hash — existing packages stay
  current. A custom template hashes its own code, only while the shadow is on.
* An invalid stored template fails the export ("the shadow template or icon bounds
  are invalid"); it never silently drops the shadow.
* `shippedBounds`/`insideArtboard` moved to `lib/upload/shippedbounds.ts` (placement
  re-exports them) so the validators do not depend on the module that applies them.
* The editor is the shared `UploadTemplateDialog` (badge and shadow): the badge ids
  and texts did not change.

Owners: `lib/upload/{shadowtemplate,customshadow,shadow,shippedbounds}.ts`,
`upload/UploadShadowTemplate{Setting,Dialog}.tsx`, `upload/UploadTemplateDialog.tsx`;
[handles](../selectors/upload-shadow-template.md). Tests: `upload_shadowtemplate`
(validation, placement geometry, strokes, settings, fingerprint, export, EPS),
`upload_shadow_editor` (draft, preview, scope, focus), `upload_badge_editor`.
