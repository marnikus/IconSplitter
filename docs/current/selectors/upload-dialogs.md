# SVG to upload — settings and metadata dialogs

Selector priority and object shape: [shared conventions](shared.md#i-selector-object-structure--for-every-element). Part of [SVG to upload selectors](upload.md).

## Settings dialog (`upload-dialog-backdrop`, `role="dialog"`)
**2026-10-19 — "default" for every visual setting** ([plan](../../archive/2026-10-19-upload-default-settings/README.md)):
- `upload-set-as-is` ("All default (export as is)", `aria-pressed` while every visual field is default) + `upload-set-as-is-note`;
- `upload-set-padding-default` (toggles null ↔ 8; `upload-set-padding` then reads empty, placeholder `default`);
- `upload-set-bg-default` (before `-transparent`);
- `upload-set-stroke-color-artwork` now reads **Default**; both "none" choices are buttons;
- the artboard select's first option is `source` ("Default (the SVG's own)").
- `upload-set-paint-clash` (`.svg-warning`, `role=alert`): only while the stroke colour is unreadable on the background (`lib/upload/paintclash`).

`upload-set-stroke` (the stroke WIDTH) exists **only in the icon scope** (follow-up 2026-10-19): that icon's own width (placeholder `bar: …`, committed on leave), with `upload-set-stroke-inherit` ("Bar (…)", `aria-pressed` while inherited) and `upload-set-marker-stroke`. The global width is the bar's `upload-stroke`.
The older text below is kept for the other handles.

`upload-dialog-scope` (the global-defaults vs per-icon wording),
`upload-set-{padding,stroke,mp,quality}` (`input[type=number]`, clamped on
change; `upload-set-stroke` is "Stroke width (px)" since 2026-10-08 — the
number typed is the number written in the file, and the row cell reads
`2 px`), `upload-set-{optimize,eps}` (checkboxes), the background
(`upload-set-bg-transparent` — the default, a checkerboard swatch —
`upload-set-bg-{white,black,gray,green,red}` + `upload-set-bg-custom` +
`upload-set-bg-value`, which reads `transparent` or the hex), the stroke
colour (2026-10-08: `upload-set-stroke-color-artwork` — a diagonal-cut
swatch — `upload-set-stroke-color-{white,black,gray,green,red}` (`black` is
the default: ONE global `stroke="#000"` in the file) +
`upload-set-stroke-color-custom` + `upload-set-stroke-color-value`, which
reads the hex or `artwork`; its marker is `upload-set-marker-stroke-color`),
every swatch carrying `aria-pressed`, the per-field marker
`upload-set-marker-{field}` ("inherited" / "overridden", icon scope only),
`upload-set-reset` (icon scope: deletes the override — one undoable entry),
`upload-set-close`. The row's settings cell `upload-settings-{id}` names the
background (`transparent` or the hex) and appends `· stroke #hex` when a
stroke colour is pinned.
The EPS converter row (2026-10-09) is `upload-set-eps-converter` (`<select>`
whose options ARE the registry: `builtin` "Built-in (PostScript subset)",
`inkscape` "Inkscape CLI (local helper)"; marker
`upload-set-marker-eps-converter`; choosing one never toggles
`upload-set-eps`). Only for `inkscape` the helper row `upload-eps-helper`
renders: `upload-eps-helper-url` (the helper URL, saved as typed when valid),
`upload-eps-helper-check` (re-probes) and the state line
`upload-eps-helper-state` — `helper running · Inkscape 1.3.2` (class `ok`),
or the reason + fix (class `warn`): `… not reachable — … run_inkscape_bridge.bat`
/ `the Inkscape helper is running but Inkscape was not found — install
Inkscape 1.x (inkscape.org) or set INKSCAPE_PATH`. The probe runs when the
row appears and on Check. Before a batch that wants Inkscape EPS, one probe
runs: when the helper is not usable the toast (`upload-toast`) says
`EPS: <reason> — N rows will be partial · <fix>` up front and again on the
batch's final line. `upload-set-expand` (checkbox) is "Expand strokes
to fills". The row's settings cell reads `eps off · builtin` /
`eps on · inkscape` and appends `· strokes → fills` when expansion is on.
The artboard row (2026-10-08) is `upload-set-artboard` (`<select>`: Content /
the square presets / Custom), its hint `upload-set-artboard-note`, and — only
for Custom — `upload-set-artboard-w` / `upload-set-artboard-h` (numbers,
clamped when the field is left — blur/Enter; a draft while typing, 2026-10-19) with the reduced-gcd ratio `upload-set-artboard-ratio` and
the megapixel readout `upload-set-artboard-mp`. `upload-set-mp` is NEVER disabled (2026-10-08): with a pinned
artboard the checkbox `upload-set-mp-match` ("same size as the artboard",
default checked) offers the choice, typing a megapixel value unticks it in the
same gesture, and `upload-set-mp-note` says what the JPEG will really be
(`the JPEG is the artboard itself: 1024×576 px — untick for a bigger file` vs
`rendered from the vectors at this resolution, at the artboard's aspect
ratio`). With a `content` artboard the checkbox is not rendered at all.
Under the artboard select (2026-10-09, I-62): `upload-set-mp-scale` (checkbox
"scale to", disabled with a pinned artboard), `upload-set-mp-target` (number
1–64 step 0.1, disabled while the box is off; the artboard's megapixels, NOT
the JPEG's `upload-set-mp`) and `upload-set-mp-scale-note` (`the artboard
(icon + padding) is scaled to 5 MP · strokes keep their px` / `the pinned size
decides the megapixels`); the row's settings cell appends `· artboard 5 MP`
while it applies.

Metadata confirmation (`upload-meta-backdrop`, `role="dialog"`): the exact
request — `upload-meta-provider`, `upload-meta-endpoint`,
`upload-meta-prompt` (the exact prompt that WILL be sent, read-only, wrapping),
the auth/retries facts, the images the request will carry
(`upload-preview-strip`, one `upload-preview-{id}` with its own
`upload-preview-caption-{id}`, `upload-preview-count`,
`upload-preview-busy` while they render, `upload-preview-none` when none could
be), `upload-meta-confirm` (sends; disabled until the previews are ready;
label matches Generate vs Regenerate) / `upload-meta-dismiss` /
`upload-meta-cancel`. The title `#upload-meta-title` reads "Generate metadata
for N icons" or "Regenerate metadata for N icons"; when opened by "⇪ Export
selected", it also says "…, then export N". Regeneration's note states that a
returned answer replaces current text and is never auto-accepted; review it and
fix validation errors before accepting, while provider failure preserves it. The
extra note `upload-meta-then-export` states
the accept-as-it-lands rule before anything is paid for.
