# Upload — selectors

[Behaviour and owners](../sor/stock-upload.md) · [setup](../sor/stock-upload-setup.md)

Semantic queries first; explicit handles for list/shell boundaries:

| Test id | Meaning |
|---|---|
| `tab-stock-upload` | Sixth tab, visible label Upload; existing `tab-upload` remains SVG to upload |
| `stock-upload-panel` | Kept mounted, hidden when another mode is active |
| `stock-open-folder` | Shared Open folder picker/capture |
| `stock-full-path` | Handle-bound full path/fallback note |
| `stock-toolbar` | Sticky selection/zoom/badges/upload/destinations/formats |
| `stock-list` | JSON∩disk exported packages only |
| `stock-row` | One package; use contained name/path to identify it |

Reuse `upload-rowbadge-*` handles with the committed **pair ID**, not stock row ID;
they denote shared badge controls/assignments. Metadata fields use visible labels
(title/description/creator/copyright/Keywords); action Accept & embed metadata.
Filters: Filter exports, Badge filter, Sort exports. Location · copy folder copies
the containing export folder. Select visible and Deselect all preserve the common
selection contract; Q/E and arrows do not hijack text inputs.

Stock controls: Shutterstock preset, Stock destination, explicit-FTPS checkbox,
JPEG/PNG (JPEG supported here), EPS; disabled SVG/ZIP expose unsupported reasons.
Upload is disabled outside the installed extension, without an eligible selection
or destination, or during work. EPS review binds to the selected paths/hashes.
Cancel batch is present only for cancellable native transfers, not metadata saves.
Local Shutterstock account & transfer history expands ephemeral username/password
fields, Save locally, Forget account, Transfer history and Clear reconciled history.
No stored password is displayed. All companion launch actions are explicitly
confirmed. Browser extension/native installation and stock acceptance are separate
manual gates, not inferred from these DOM handles.
