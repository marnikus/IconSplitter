# Location — open a file's place in Explorer (every tab)

Owners: `src/ui/locate.ts` (app), `tools/bridge/openfolder.mjs` (helper `POST /open-folder`). Tests: `tests/locate_path.test.ts`, `tests/bridge_open_folder.test.ts`.

Since 2026-11-16, every tab's Location action goes through `ui/locate.ts`: Batch rows and split folders, Selection, Generate SVG, SVG to upload, Upload and the SVG builder's 📂 Location.

- **The full path is always copied.** For an item that is an **existing file**, the file's own path is copied (checked through the folder handle); otherwise the folder's. The texts come from `lib/copypath` + `lib/rootpath`, so every tab names the same place.
- **Explorer opens at it** through the local helper:
  - the folder, with the file selected when there is one (`explorer.exe /select,<file>`);
  - the helper accepts only an existing folder as a full path, and a file only when it sits directly inside it;
  - the file manager gets ONE argument and no shell.
- **When it cannot open:** without the helper, or before the folder's full path was captured (browsers never expose it: Ctrl+Shift+C in Explorer when picking, then Rescan), the path is still copied and the message says why.
