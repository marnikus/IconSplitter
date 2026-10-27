# Upload — selectors

[Behaviour and owners](../sor/stock-upload.md) · [setup](../sor/stock-upload-setup.md)

Semantic queries first; explicit handles for list/shell boundaries:

| Test id | Meaning |
|---|---|
| `tab-stock-upload` | Sixth tab, visible label Upload; existing `tab-upload` remains SVG to upload |
| `stock-upload-panel` | Kept mounted, hidden when another mode is active |
| `stock-open-folder` | Shared Open folder picker/capture |
| `stock-full-path` | Handle-bound full path/fallback note |
| `stock-toolbar` | Existing `svg-bulkbar-pin`, selection/zoom/badges/upload/destinations/formats |
| `stock-bulk`, `stock-check-all`, `stock-selected-count`, `stock-scope` | Shared bulk shell, visible-scope tri-state checkbox/counts |
| `stock-select-visible`, `stock-deselect`, `stock-hidden` | Common bulk selection and hidden-check warning |
| `stock-thumb`, `stock-thumb-value` | Same SVG zoom widget and48–800px range |
| `stock-upload-start` | Confirm eligible selected exports; never starts a host on opening the tab |
| `stock-account-toggle` | Existing minimizable provider card; aria-expanded |
| `stock-preset-{select,load,save-open,form,name,save,rename,rename-confirm,remove,remove-confirm,remove-cancel,edit-cancel,status}` | Shared compact preset controls; select alone never loads |
| `stock-confirm-{cancel,continue}` | Existing SVG modal for transfer/account/metadata writes |
| `stock-list` | JSON∩disk exported packages only |
| `stock-row` | One package; use contained name/path to identify it |

Reuse `upload-rowbadge-*` handles with the committed **pair ID**, not stock row ID;
they denote shared badge controls/assignments. Metadata fields and Copy/rights/validation reuse `upload-meta-*` / `upload-copy-*`
with ID `stock-<physical row ID>` (use attribute-prefix queries for paths). Visible
labels are Title, Description, Tags and optional Creator/Copyright; action
Accept & embed metadata. Filters: Filter exports, Badge, Sort exports. Location · copy folder copies
the containing export folder. Select visible and Deselect all preserve the common
selection contract; Q/E and arrows do not hijack text inputs.

Stock controls: Shutterstock presets (group) / Preset (selector), Stock destination, explicit-FTPS checkbox,
JPEG/PNG (JPEG supported here), EPS; disabled SVG/ZIP expose unsupported reasons.
Upload is disabled outside the installed extension, without an eligible selection
or destination, or during work. EPS review binds to the selected paths/hashes.
Cancel batch is present only for cancellable native transfers, not metadata saves.
Local Shutterstock account & transfer history expands ephemeral username/password
fields, Save locally, Forget account, Transfer history and Clear reconciled history.
No stored password is displayed. All companion launch actions are explicitly
confirmed in `.svg-backdrop > .svg-modal[role=dialog]` with the disclosed target
and task, never a new theme. Escape/Cancel/backdrop/tab departure cancels pending
confirmation; the focus stays in the dialog and row shortcuts are disabled. Browser extension/native installation and stock acceptance are separate
manual gates, not inferred from these DOM handles.
