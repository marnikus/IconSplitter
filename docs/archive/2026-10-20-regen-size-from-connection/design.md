# One place sizes a request: the connection's Images / request (2026-10-20)

Supersedes the confirmation's own count in
`docs/archive/2026-10-20-regen-batch-and-task-prompts/design.md` §2.2 (the
`svg-confirm-regen-size` control) and the key it wrote
(`iconSplitter.svg.regenBatch.v1`). Everything else there — the 1..9 range, the
batch text, the frozen plan, the matching rules — is unchanged.

## What was wrong

The popup offered a second number for the same question the provider card
already answers. Two controls that size a request drift apart in practice: the
card's "Images / request" says how much one request may carry, the popup's said
how many icons a regeneration carries, and nothing told the user which one a
run would follow. The confirmation also spent its scarcest space (above the
page previews) on a control nobody needs while confirming.

The user asked plainly: *do not use icons-per-batch in the popup — it is
already set up in the connection window.*

## The decision

**The connection's `imagesPerRequest` is the only count.** The regeneration
plan clamps it into the regeneration range (`lib/svgregen.clampRegenPerRequest`,
1..9) at confirmation time and freezes the result in the plan, exactly as it did
with the popup's value. The confirmation therefore still *shows* the number it
will use ("1 × 9 max", "each request sends its 4 icons' current SVG code…"),
and the frozen batch still cannot be changed by editing settings afterwards
(I-76).

Removed: `svg-confirm-regen-size`, `regenSize` / `regenSizeWarning` /
`onRegenSize` on the confirmation, `src/svg/regenprefs.ts`, the stored key and
its parse/serialize pair. The confirmation no longer reads storage to decide a
size at all.

## Consequences

* The default regeneration request size is the connection default (4) until the
  user raises "Images / request" to 9; the 1..9 ceiling and the 3×3 sheet are
  unchanged.
* `clampRegenPerRequest` stays — it is the one clamp that turns the configured
  number into a legal regeneration size (and a junk value into the default).
* The image-edit popup keeps its own count: an image edit sends image cells,
  not SVG codes, and the two are limited differently (I-72).

## Verification

`npx tsc --noEmit`; `tests/svg_confirm_regen_batch.test.tsx` (size now comes
from `config.imagesPerRequest`, and the popup has no field),
`tests/svgregen_batch.test.ts` (the clamp, no pref round-trip),
`tests/svg_queue_ui.test.tsx` (the queued regeneration follows the configured
size), the full `vitest` run and `node tools/quality.mjs --files …`.
