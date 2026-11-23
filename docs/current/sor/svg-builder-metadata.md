# SVG builder — sheet and artboard metadata

Parent: [SVG builder](svg-builder.md) · artboards: [templates & presets](svg-builder-presets.md) · selectors: [templates & artboards selectors](../selectors/svg-builder-presets.md).

Since 2026-11-14 the builder's metadata is the **same system as the SVG to upload tab**.

- **Fields** (`lib/svgBuilder/metadata.ts`, `SheetMetadataFields`): **Title**, **Description**, **Tags**. They are parsed, cleaned and validated by `lib/upload/meta.ts`:
  - `parseMetadata` reads the labeled `Title:` / `Description:` / `Tags:` lines; `Title 1:` and `Title 2:` are ignored.
  - `cleanPhrase` applies sentence case and drops the end period; tags are deduped.
  - `validateMetadata` requires a title of at least 5 words, a description of at least 7 words, at least 10 tags, and the seven mandatory tags.
  - Older saves are read with `subtitle` → `description` and `keywords` → `tags`.
- **Prompt**: `DEFAULT_SHEET_PROMPT` is the stock prompt. It asks for Title 1, Title 2, Title, Description, Tags and **Title-Artboard**. A saved copy of the old JSON prompt is replaced with it on read (`isLegacySheetPrompt`).
- **Image** (`lib/svgBuilder/metaimage.ts`, `metaimagefor.ts`, `preview.ts` `sheetPngFor`):
  - **icons only** (banner cut off so the grid keeps its exact size), or with **Send the whole sheet with its banner** (`builder-meta-full-sheet`, pref `metaFullSheet`, default off) the whole sheet (redrawn at once before anything is sent);
  - rendered via `sheetPngBlob` (`exporter.ts`) as **one PNG of at most 1 MP** (`megapixelSize`), shown in the confirmation and sent unchanged.
- **Answer** (`parseSheetAnswer`): Title, Description and Tags become metadata. **Title-Artboard** (2–5 words) becomes the artboard's **visible banner title** (subtitle "Editable stroke width") unless **Put the answer's title on the banner** (`builder-meta-title-banner`, pref `metaTitleToBanner`, default on) is unticked, leaving banner words unchanged. Both choices sit in `SvgBuilderMetaOptions.tsx` and persist.
  - On artboards (✦ Generate metadata, `withSheetAnswer`) this applies at once; an open artboard updates on stage too without unsaved state.
  - On the current sheet the answer applies at once (no draft step): accepted when upload rules pass, else invalid with errors in the editor; Title-Artboard lands on the banner as one undo step and the confirmation closes.
- **Banner text**: metadata never replaces the banner words any more (`sheetCopy`). The SVG's hidden `<title>` uses the accepted metadata title, and `<desc>` holds the description and tags.
- **Editing** (`SvgBuilderMetaFields.tsx`, in the metadata widget): the upload tab's `UploadMetaFields` (Title, Description, Tags, each with Copy, without the Icon Name field: `showName={false}`).
  - Editing an accepted answer marks it `edited`.
  - **✓ Accept** re-validates and refuses with the exact rule violations.
  - **↻ Regenerate** opens the exact request.
  - On an open artboard the edits are part of its draft (✓ Save artboard).
- **Per artboard row** (2026-11-15, `SvgBuilderRowMeta.tsx`, `actions/artboardmetaedit.ts`):
  - Clicking a row (making it the active row) opens the same upload-tab editor under it (`upload-meta-*-<artboard id>`).
  - Edits and ✓ Accept are written into that artboard at once. An artboard open on the stage gets the same metadata there, so it shows no unsaved change.
  - Every row has **↻ Metadata** (`builder-artboard-regen-<id>`), which opens the exact-request confirmation for that one artboard.

## Saving sheets in the folder (2026-11-16 layout)

The tree mirrors single icons' `_split_output`, but under **`_artboard_sheets`** (`lib/svgBuilder/sheetfolders.ts`):

```
_artboard_sheets/<YYYY-MM>/<YYYY-MM-DD>/<template>/
  template.json                                   ← the template's blueprint
  artboard_<NN>_<its title>/                      ← one per derived artboard
    sheet.json  metadata.json  preview.png  export/…
```

- **Template folder**: `<its title>_sheet_<cells>_icons_<colour>_<colour>_palette_id<code>` (`templateFolder`).
  - It is made as soon as the template is created and refreshed on every save (`actions/templatefolder.ts`).
  - `template.json` is the sheet preset (`presetJsonOf`, format `iconsplitter-sheet-preset`): config, icons by name and id, locks, seed, recipe and metadata. That is enough to rebuild the design.
  - With no folder open, nothing is written yet: the folder is made the first time one of its artboards is written.
  - The template remembers its folder (`SheetTemplate.folder`, validated on read).
- **Artboard folders** sit inside their template's folder: `artboard_<NN>_<its title>`, where NN is its "#N" and the title is its Title-Artboard after generation (`artboardFolder`). The artboard remembers its folder (`FinalArtboard.folder`), so later saves land in the same place even after a rename.
- **When metadata is generated** (✦ Generate metadata): the variant folder is created with `metadata.json` (Title, Description, Tags, Title-Artboard, validation, prompt, model) and `preview.png`, the exact image that was sent (`sheetwriter.ts`).
- **⇪ Export all selected** (header, `builder-export-selected`): exports the checked artboards (else the open one), from their **saved** state. Each one goes into `…/artboard_variant_<N>/export/` (`actions/sheetexport.ts`, `sheetpackage.ts`):
  - `<stem>.svg` with the metadata embedded, where `<stem>` is the sheet folder name + `_v<N>`;
  - `<stem>.jpg` at the Upload settings' megapixels, with XMP metadata;
  - `<stem>.eps` from the Upload settings' EPS converter, with `currentColor` resolved first. The built-in writer may refuse text; the Inkscape helper converts it;
  - `<stem>.png` at full size, 2×;
  - `export.json`: the Upload tab's export record (status `processed`, or `partial` when a part failed), so the stock upload tab discovers the package.
  - Every failed part is reported in the toast and the rest still ships.
  - While running, `SvgBuilderExportProgress` (`builder-progress-mount`, `builder-export-progress-…`) advances live per artboard with `{done} completed / {total}`, `{left} remaining`, `%`, the current artboard name, Cancel (aborts EPS / stops before the next artboard, keeping real progress), Review results and ✕ ([process-progress.md](process-progress.md)); `builder-export-selected` and `builder-busy` also show live `done/total` and `left`.
  - The export counts the icons' use once per artboard, and the artboard remembers its folder and `exportedAt`.
- The builder header is pinned to the top while the page scrolls.

## Files edited outside the app — 🗂 Register (2026-11-16; reading back 2026-11-22)

- **sheet.json** (`actions/sheetjson.ts`): each artboard folder's full preset (`presetJsonOf`). For the artboard open on the stage it follows the stage live; every other artboard's follows its SAVED state, rewritten when the artboard or its template's look changes (`useSheetFileMirror.ts`, `actions/sheetsync.ts`). metadata.json follows the saved metadata too (its prompt, model and time kept).
- **🗂 Register templates and artboards** (`builder-register`; *Automatic register* `builder-auto-register` runs it after every scan; `actions/register.ts`, `lib/svgBuilder/registerplan.ts`): new template folders (template.json) and artboard folders (sheet.json / metadata.json) join the lists. A KNOWN template or artboard is updated from a file edited outside the app: template.json → its look; sheet.json → words, icons by name (names not in the library stay empty and are counted), locks, its own look changes (measured against the template the file was written with), metadata; metadata.json → metadata (an accepted one turns *edited* until ✓ Accept). What the stage shows follows its files unless it holds unsaved edits (kept; the toast says so). Then files still holding an older copy get the app's state. Folders deleted by hand are not removed from the app.
- **Fingerprints** (`filesigstore.ts`, `lib/svgBuilder/sheetsync.ts`): the app remembers a fingerprint of every JSON file it writes or reads, so its own copies — older ones, the open artboard's live draft — are never read back as edits, and its automatic writes never go over a file changed outside the app (the stage says once that it waits for Register). ✓ Save template still writes template.json and says when that replaced an outside change. A template.json from before fingerprints is read when newer than the template's last save; artboard files from before fingerprints that differ are replaced once, after a copy goes to that folder's `.removed versions/<file>~<stamp>`.
- **✦ Generate metadata in the pinned header** (2026-11-15, `builder-header-generate-metadata`, beside ⇪ Export all selected): it generates for the checked artboards, else the open artboard, else the current sheet. The exact-request confirmation is shown first, as everywhere else.
