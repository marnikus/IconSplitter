# Upload shadow template editor handles

Owner: [shadow SVG template](../sor/upload-shadow-template.md). The editor is the
same component as the [badge template editor](upload-badge-template.md), so every
handle below mirrors the badge's with `shadow` for `badge`.

| Handle | Contract |
|---|---|
| `upload-shadow-template-edit` | Opens the editor in global or icon settings, even when the shadow is off |
| `upload-set-marker-shadow-template` | Inherited/overridden marker in the icon scope |
| `upload-shadow-template-backdrop` | Click outside editor cancels only its draft |
| `upload-shadow-template-dialog` | Portaled modal above inert parent settings, named by `upload-shadow-template-title` |
| `upload-shadow-template-code` | Labelled controlled textarea: the effective SVG or the bundled source |
| `upload-shadow-template-preview` | Validated SVG in an isolated IMG; absent for invalid input |
| `upload-shadow-template-valid` / `upload-shadow-template-error` | Live status: the SVG size, or what to change |
| `upload-shadow-template-default` | Restore the bundled code to the draft; no settings write until Apply |
| `upload-shadow-template-cancel` | Discard the draft and return focus to the trigger |
| `upload-shadow-template-apply` | Disabled if invalid; commits `shadowTemplateSvg` in the current scope (`""` for the bundled graphic), never turns the shadow on |
