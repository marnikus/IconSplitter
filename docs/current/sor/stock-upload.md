# Upload to stock sites — planned tab (not implemented)

**Status: planned.** This page records the contract the sixth tab will be built
to. Nothing it describes exists in the app yet; a behaviour claim here is a
requirement, not a report. Plan, research and ordered steps:
`docs/archive/2026-10-27-stock-upload/README.md`.

## 1. What the tab is for

"SVG to upload" produces export packages. The **Upload** tab delivers them to
stock sites over FTPS. It shares that tab's list behaviour and adds delivery;
it is not a second export pipeline.

## 2. Which rows exist

Only committed packages: a pair's `export/export.json` must be present, be
committed (`timestamps.committedAt`, status `processed` or `partial`), and name
the file in `outputs`. The named file must exist inside that same `export/`
folder. Stray files, superseded artifacts, files outside `export/` and corrupt
records never become rows; each refused case is reported with its reason.

Per named file the row says whether it is named, size-checked, hash-verified,
changed since export, or missing. `changed` and `missing` block that file.

## 3. Row controls (cloned from SVG to upload)

Preview of the exported file (JPEG → PNG → SVG, whichever the package has), the
name, the full path, **Location**, editable metadata fields, badges, and the
per-file state. Selection is the shared RULE 25 contract
([RULE 25](../rules/BEHAVIOR.md#rule-25)) with one history entry per gesture and
cross-tab undo ([I-73](invariants/shared.md#i-73)).

Badges are the **same catalog and the same assignments** as
[SVG to upload](upload-row-badges.md) ([I-79](invariants/upload.md#i-79)); one
store, one meaning.

## 4. The pinned bar

Open folder + full path (shared [folder controls](../selectors/shared.md)),
badge controls, the stock-site drop list with a checkbox per site and a preset
editor, format checkboxes (JPEG / PNG / SVG / EPS / ZIP), zoom, **Apply badges**
and **Upload (N)**.

A format is sent for a row and a site only when it is checked **and** the
package has it **and** the site accepts it; every empty combination is reported
with its reason. No file is ever renamed — the package's shared stem is the
remote name.

## 5. Stock presets

Preset = `{ id, label, host, port, security, loginField, remoteDir, formats,
zip, docs }`. Every field is editable and a site can be added by hand.
Shutterstock is the one built-in and the only working connection in v1:

- `ftps.shutterstock.com`, port 21, explicit FTP over TLS, contributor e-mail
  or username;
- accepts JPEG and EPS (EPS 8/10, 4–25 MP on the artwork's bounding box); no
  SVG, no PNG, no ZIP;
- FTPS carries media only — metadata travels inside the files or as a CSV
  applied later on the Submit page.

## 6. Credentials (local only, not expanded)

Per site, the login and password live in the IndexedDB `secrets` store through
[`lib/idbvault`](../../../src/lib/idbvault.ts) — never in localStorage, a log, a
toast, the CSV, `export.json`, the session snapshot or a URL. A failed read is
reported as unreadable, never as "no credentials".

## 7. Delivery

A browser cannot open an FTPS connection, so the transfer goes through the
existing loopback helper (`tools/bridge`, 127.0.0.1). Without it the tab says so
and offers the verified **Download** path instead; it never reports a success it
did not have. One file per request, sequential, cancellable, never overwriting a
remote name by default, with one honest report line and a `sent` stamp per
delivered file.

Nothing in this tab writes into the user's folder.

## 8. Tests (to be created with the code)

`stock_tab`, `stock_discover`, `stock_verify`, `stock_list`, `stock_preview`,
`stock_badges`, `stock_presets`, `stock_credentials`, `stock_plan`,
`stock_ftpclient`, `bridge/ftp`, `stock_run`, `stock_csv`,
`stock_perf_budgets` — see the plan's §10. Invariants I-80…I-85 are defined when
the code lands, never before.
