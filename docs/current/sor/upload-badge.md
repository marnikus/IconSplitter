# Upload corner badge — checked-only, artboard-relative vector

Part of [SVG to upload](upload.md). Geometry/placement lives in `src/lib/upload/cornerbadge.ts`, with `custombadge.ts` for user templates. The default is the supplied seven-path `src/svg/templates/editable-stroke-width.svg` (412×20, “EDITABLE STROKE WIDTH” with handles). This is vector artwork, not editable text, a raster image, a filter, or a preview-only overlay. Users can replace it with SVG code as described below. The approved source file is never rewritten. See [I-60](invariants/upload.md#i-60), [dialog selectors](../selectors/upload-dialogs.md) and the [named design note](../../archive/2026-10-20-upload-corner-badge/design.md).

## Who receives it

The Export settings popup has a **Checked icons (N)** checkbox with off/mixed/all states. Mixed adds the badge to all checked icons; all-on removes it. Hidden checked rows count; an active but unchecked row does not. One **Badge defaults** fieldset (width %, corner, X inset %, Y inset %) is the only placement control set: it edits inherited defaults and never turns on an unchecked icon or pins a checked one. Checked badge-on icons without a placement override follow those defaults; a per-icon override stays pinned. The per-icon popup offers its own checkbox, override markers and reset. Stored global `badgeEnabled:true` is ignored on read; only a validated icon override opts in. A global control never pins the badge (2026-10-21): the checkbox stores the values it set (`badgeEnabled` and its geometry) in the `applied` map (`lib/upload/decorations`), so the row and its badge row read `inherited` and a decoration is not an override. The bar's “↺ Reset to inherited (N)” deletes that row's whole override map and the badge keeps applying; only the checkbox itself turns it off.

Default: off; corner **bottom-right**; requested width **40%** of the final artboard width (1–100%); inward X/Y distances **3%** each (0–100%). X is measured from the selected left or right edge as a percentage of artboard width; Y from the selected top or bottom edge as a percentage of artboard height. The corner choice changes the labels accordingly.

## Placement and output

The icon (and any Shadow) is baked/restyled/fitted first; the badge is appended **last**, above the icon, after the artboard background and stroke unification. It never participates in fitting the icon or expands the artboard. The actual emitted `viewBox` (origin 0) determines W/H and exact inward margins. The supplied seven paths are uniformly scaled, preserving their 412:20 aspect: one glyph is an opaque black fill and six handle paths are opaque black 1.5-unit outlines. With **Expand strokes** on, those six handles become filled paths too and count towards `strokesExpanded`, so the badge ships without strokes. Requested width is capped by the room remaining after both offsets, so it can shrink on a shallow board; the entered offsets are never silently moved. A 100% inset, unmeasurable output at file precision, hidden/faded source root, or malformed bundled template fails preparation by name rather than clipping or omitting the badge. Root/inherited stroke paint cannot recolour its explicit black paths.

Preview and JPEG render the same prepared vector; optimized clean SVG and built-in EPS contain the opaque paths. Badge + Shadow can export native vector EPS; unproven alpha overlaps fail closed, never rasterize. Badge-off/default fingerprints and byte-for-byte as-is exports are unchanged. Only an enabled badge fingerprints the corner, full percentages and actual selected template hash, so edits mark affected packages stale. Tests: `upload_badge_settings`, `upload_badge_geometry`, `upload_badge`, `upload_runexport`, `upload_live_preview` and `upload_ui`.

## Custom SVG templates

**Edit SVG template…** in either settings scope opens a code textarea and live
isolated-image preview. The editor starts with the effective template's source
(or the bundled source). Draft changes never affect row previews or exports
until **Apply template**. Invalid input shows a reason, removes the preview and
disables Apply. **Cancel**, Escape and backdrop discard drafts; **Restore
default** changes only the draft until Apply. Focus is trapped in the editor,
its parent is inert, and closing returns focus to the trigger.

`badgeTemplateSvg` is empty for the bundled graphic; otherwise it is a validated,
canonical SVG string. Global Apply changes inherited defaults without writing
row pins or enabling unchecked icons. A direct icon Apply pins only that icon,
preserves unrelated fields and uses one undo/redo gesture. Reset to inherited
clears that pin and all other local overrides; selection-applied badge flags
stay in `applied`. Defaults, applied values and pins validate/reload through
the existing settings store. Invalid persisted SVG costs only that field.

Supported: finite positive `viewBox` of any aspect/origin; paths, rects (including
rounded), circles, ellipses, lines, polygons/polylines, groups, uniform stroke
transforms, solid subset paints and object-bounding-box linear/radial gradients.
Paint-only inline styles/simple stylesheets are folded (`badgestyles.ts` preserves class specificity, source order and inline precedence). Text must be outlined.
Images, scripts, animation, foreign elements, events, external references,
DTD/entities, unknown attributes/styles, nested SVG viewports, duplicate IDs,
clipping/masks/filters, user-space gradients and other unproved vector features
are refused by name, never silently removed or rasterized. Source paint must
fit inside its viewBox including strokes. Limits: 200000 characters, 2000
elements, 32 nested levels. Validation also proves the native EPS subset.

`badgetemplatesafety.ts` owns the inert-XML allowlist; `badgetemplate.ts` owns
canonicalization and persistence validation; `settingsbadge.ts` owns settings.
Preview uses only approved SVG in an IMG data URL, never raw live markup or
network resources. `custombadge.ts` uses shared copy/bake/cap/expansion math and
the same corner/inset fit with the selected viewBox aspect. Root paint defaults
isolate the template from icon fill/stroke inheritance, referenced IDs are scoped
against artwork/shadow/guide IDs, and final bounds are proved before append.
The row preview and JPEG consume that same prepared artwork; SVG/native EPS
contain the replacement vectors. Badge-off/as-is fingerprints are unchanged;
changing an enabled template invalidates existing export fingerprints.

Owners: `src/upload/UploadBadgeTemplateSetting.tsx`,
`src/upload/UploadBadgeTemplateDialog.tsx`; [editor handles](../selectors/upload-badge-template.md).
Tests: `upload_badge_template` (validation/settings/geometry),
`upload_badge_editor` (draft/preview/scope/focus), `upload_live_preview`
(apply/undo/redo/remount/reset) and `upload_badge_template_export` (actual supplied
SVG through clean SVG/JPEG/vector EPS, optimizer on/off; preserves both user originals).
