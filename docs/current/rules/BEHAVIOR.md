# Behaviour rules

Canonical rules for this topic. Return to the [RULE 1–25 index](../AGENT_RULES.md) for the other rules.

<a id="rule-1"></a>

## RULE 1 — All pixel math goes through `src/lib/`

> **Any code that reads image pixels, builds masks, computes boxes, or draws onto a canvas MUST live in `src/lib/detect.ts` / `src/lib/render.ts`. The UI (`App.tsx`) orchestrates; it never hand-rolls `getImageData` / `drawImage` math inline.**

The lib is the single place that implements the pipeline phases:

| Phase | Owner | Contract |
|---|---|---|
| **ANALYZE** | `analyze(img)` → `Analysis` | background colour, ink mask, threshold |
| **DETECT** | `detect(a, radiusFrac)` → `DetectResult` | boxes in natural-image coords, reading order |
| **RENDER** | `squareInfo` / `cropRect` / `renderIcon` | square output canvas per icon |
| **DELIVER** | `canvasToBlob` + zip/folder/clipboard in App | bytes leave only as finished blobs |

Why centralised: fixing detection/quality happens in exactly one place; the UI stays a thin, testable orchestrator; lib functions stay pure and unit-testable (RULE 8).

<a id="rule-2"></a>

## RULE 2 — Report every step through the toast/status surface

Every meaningful step of a user-visible operation reports via `say()` (toast) and the `busy` state. A step that fails silently is a bug — always say why ("Could not read image", "No icons to export", "Clipboard is blocked by the browser — use Download instead"). Errors are reported distinctly from success (`err: true`), never swallowed by an empty `catch {}`.

<a id="rule-3"></a>

## RULE 3 — Detection and rendering are pure functions of explicit inputs

`analyze`, `detect`, `squareInfo`, `cropRect`, `renderIcon` take everything they need as parameters and read no module-level mutable state. So:

* new pipeline functions follow the same shape — inputs in, result out;
* UI state (`padding`, `size`, `transparent`) is passed explicitly as `ExportOpts`, never read from globals inside lib;
* when a parameter list grows past §16.1, group by **domain concept** (`ExportOpts`, `Analysis`, `SquareInfo`) — never a catch-all `options: any`.

<a id="rule-4"></a>

## RULE 4 — Distinguish "empty" from "broken"

An empty result must be reported distinctly from failure:

* no sheets loaded (empty state UI) vs. file is not an image ("Please choose image files…") vs. image failed to decode ("Could not read image");
* sheet loaded but 0 icons detected (honest empty result, user can adjust merge radius) vs. detection throwing (error);
* export with all icons excluded ("No icons to export") vs. export failing mid-way ("Export failed").

Never let a no-op path end with a success-looking toast.

<a id="rule-5"></a>

## RULE 5 — Batch export reports progress incrementally

Anything that loops over many items (multi-sheet ZIP export, folder-save loop) must surface progress **as it happens** (`busy` message per item), not one batch message at the end.

Two matching requirements:

* a per-item failure must not kill the whole batch — catch, report the item, continue;
* yielding between items (`await sleep()`) keeps the UI responsive; never block the main thread for a whole batch.

<a id="rule-7"></a>

## RULE 7 — Interruption must be honoured by every long-running loop

Batch loops must be interruptible: the loop re-reads current state (or an abort signal) at the top of each iteration, so removing a sheet or unchecking an icon during a long export takes effect promptly, not after the loop finishes. Distinguish "interrupted" from "failed" in reporting. Inner awaits must not swallow cancellation.

<a id="rule-9"></a>

## RULE 9 — A disabled option must not stall the pipeline

An option that declines to do its work skips *only that work*, never the pipeline:

* `transparent` off → background fill, export proceeds; `transparent` on → skip fill only;
* a failed clipboard write fails open to the message "use Download instead", never a silent dead end;
* folder-save unsupported in this browser → steer to ZIP, don't block.

Skipping is success-with-note, never failure.

<a id="rule-10"></a>

## RULE 10 — One control per decision

A setting must not duplicate a decision another setting already makes:

* merge radius lives once (per-sheet slider + auto); detection reads only that;
* output size is one control (`SIZES` select), applied once in `renderIcon`;
* padding is one slider consumed by `squareInfo` alone.

When a control is retired, remove every reader of it — a dead setting that still influences output is a bug.

<a id="rule-11"></a>

## RULE 11 — Excluding an icon must not destroy detection work

Exclusion is a display/export flag, not deletion: `boxes` stays intact, `excluded` marks indices. Toggling a box back costs nothing — detection is never re-run for exclude/include, and per-box previews stay available. A mode that declines to export an item must still keep it computed.

<a id="rule-12"></a>

## RULE 12 — One global timeline for undo and redo

Undo/redo now uses **ONE** chronological timeline (`src/state/HistoryProvider.tsx`) above every tab. A `Ctrl+Z` outside text fields reverses the most recent recorded edit regardless of its originating panel; no separate undo per panel. Every newly undoable edit (sheet list/options, exclusions, merge radius, padding/size/transparent, reviews) must join this timeline. Failed applies leave its cursor unchanged, and continuous gestures form one entry.

<a id="rule-13"></a>

## RULE 13 — Never persist state you cannot read back

State is persisted today: the session snapshot and global undo timeline use localStorage (`src/state/sessionstore.ts`, `src/state/historystore.ts`); preferences and presets have their own stores, and folder handles use IndexedDB. Validate on read (version, shape, numeric sanity), **REJECT** corrupt or foreign payloads and fall back to safe defaults — never crash the app on startup. A bad payload must cost one ignored load, never a bricked app. Keep writes atomic where the API allows.

<a id="rule-24"></a>

## RULE 24 — LIVE SYNC: the UI mirrors the stored value at the moment of change

* Every value the user can SEE or EDIT must display the current state IMMEDIATELY when it changes — from any source: adding a sheet, re-detecting, toggling exclusion, moving a slider. No visible value may wait for a re-render triggered by something else.
* Every mutation goes through state setters with fresh derived values (`useMemo` over current state) — never a cached copy of boxes or previews that can drift from the source of truth.
* Anti-pattern (banned): "it is in state, it will show after some other interaction". If a user action needs another action to become visible, the sync is broken.

<a id="rule-25"></a>

## RULE 25 — One list-selection gesture contract

Batch, Selection V2, Generate SVG and SVG to upload use **Batch's** list gestures. The active row (keyboard/detail target) and checked rows (bulk target) are independent; an active highlight never implies a check. Batch initially checks eligible rows after a scan; the other three lists start unchecked. A valid restored selection may survive a tab switch, filter or sort. Nested actions do not trigger row selection.

| Gesture | Active row / anchor | Checked rows |
|---|---|---|
| Plain row click; Enter on focused row | activate and anchor | unchanged |
| Row checkbox | unchanged | toggle just that row |
| Ctrl/Alt/Cmd+row click | activate; keep anchor | toggle just that row; keep others |
| Shift+row click | activate; anchor becomes target | replace with inclusive **visible-order** range from prior anchor; absent/hidden anchor → target only |
| Up/Down | move active through visible eligible rows | unchanged |
| E / Q | unchanged | check / uncheck the active row; without an active row, E selects visible and Q deselects all; never steal text input |
| Header checkbox | unchanged | tri-state for visible eligible rows; check adds them, uncheck removes **visible only**, preserving hidden checks |
| Select visible / Deselect all | unchanged | add visible eligible rows / clear every check, including hidden |

Space on a focused Batch/V2/Upload row activates it; Generate SVG retains Space as an active-check alias. Native controls keep their own Space/arrow keys. Filtering and sorting cannot silently select or discard hidden checks; prune ids only when their sources disappear. One changed selection gesture is **one undoable entry** on the global timeline (ids, anchor and active together), not separate entries or an entry for a no-op. Bulk operations consume checked eligible rows, never the active row by inference. See [I-73](../sor/invariants/shared.md#i-73) for the cross-tab guarantee and each tab's behaviour page for eligibility and confirmation gates.
