# AI-source image styles — UI selectors

Selector priority: **semantic** (role / label / text) > **structural** (parent / child) > **class fragment** (last resort). See [shared selector rules](shared.md#i-selector-object-structure--for-every-element).

Behaviour: [image styles](../sor/svg-image-styles.md). The row, its previews and
its bar cells are shared with Generate SVG
([`svg-base-ai-*`](svg-generation.md#p-generate-svg--srcsvg-verified-2026-10-01));
this page owns what styles and the version 🗑 add.

## Style bar (pinned, `src/svg/SvgStyleBar.tsx`)

| Test id | Element | Notes |
|---|---|---|
| `svg-style-bar` | wrapper | beside the bulk actions; present whether or not a style is known |
| `svg-register-styles` | button | "◐ Register styles (N)" — N = checked rows; reads each selected row's `_<style>` folders and writes the style's pair file. Disabled at 0 |
| `svg-style-select` | button | the one switch, showing the active style (`Base · line stroke` when none); `aria-haspopup="listbox"`, `aria-expanded` |
| `svg-style-menu` | listbox | the app's own dark menu (never a native list) |
| `svg-style-opt-{style}` / `svg-style-opt-base` | option | one per known style plus the base style; `aria-selected` marks the active one. The list is rebuilt from the pair files on every scan (2026-11-17), so a restart needs no second registration |

## Style row previews and version 🗑

| Test id | Element | Notes |
|---|---|---|
| `svg-base-ai-{sourceId}` | preview slot | the Base · Stroke side of a style row: the base row's chosen main image, drawn beside the style's own; no version chips of its own, but it keeps its own (empty) bar cell |
| `svg-base-ai-img-{sourceId}` | `img` | the image of that slot |
| `svg-ai-trash-{sourceId}-{n}` | button | 🗑 beside an AI-source chip (2026-11-16): removes that version from the row AND moves its file to `.removed versions`; one undo step. The row keeps every other preview — Base · Stroke included |
| `svg-ver-trash-{sourceId}-{n}` | button | the same for an SVG version chip under the SVG preview |

A style row's ids carry `~<style>` (`pair_1f2e3d4c~colored_wiggle`), so every
handle above names the style row it acts on, never its base row.
