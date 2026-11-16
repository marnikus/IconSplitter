# User SVG badge template editor

Part of [Upload dialogs](upload-dialogs.md); behavior and supported SVG:
[corner badge](../sor/upload-badge.md#custom-svg-templates).

| `data-testid` | Contract |
|---|---|
| `upload-badge-template-edit` | Opens editor in global or icon settings, even when badge is off |
| `upload-set-marker-badge-template` | Inherited/overridden marker in the icon scope |
| `upload-badge-template-backdrop` | Click outside editor cancels only its draft |
| `upload-badge-template-dialog` | Portaled modal above inert parent settings, named by `upload-badge-template-title` |
| `upload-badge-template-code` | Labelled controlled textarea, initial effective SVG or bundled source; invalid state and status association |
| `upload-badge-template-preview` | Validated SVG in an isolated IMG; absent for invalid input (never raw user markup) |
| `upload-badge-template-valid` / `upload-badge-template-error` | Live validation status, supported dimensions or actionable error |
| `upload-badge-template-default` | Restore bundled code to draft, no settings write until Apply |
| `upload-badge-template-cancel` | Discard draft and return focus to trigger |
| `upload-badge-template-apply` | Disabled if invalid; commit one template field in current scope, then close editor |

Escape cancels the editor, not the parent. Tab/Shift+Tab stay within enabled
editor controls. Apply does not toggle the badge or alter checked selection,
placement, artwork source or unrelated overrides. Global Apply edits inherited
defaults; icon Apply creates one local template pin and one undo gesture. A
bundled-source Apply stores the empty-string default choice, not duplicate SVG.
