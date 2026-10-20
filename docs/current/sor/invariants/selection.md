# Selection invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition.

<a id="i-12"></a>
* **I-12 (selection, RULE 13):** a corrupt or unwritable decision file never
  destroys decisions — in-memory records win, the user is warned, retry offered.

<a id="i-13"></a>
* **I-13 (selection, RULE 4):** "generated" never implies "approved"; a pair
  without a stored decision is pending, always.

<a id="i-14"></a>
* **I-14 (selection, a11y):** every status is text + glyph first; colour is
  reinforcement, never the only signal.

<a id="i-15"></a>
* **I-15 (selection V2, RULE 6/4):** a bulk decision touches exactly
  `checked ∩ visible ∩ complete`; hidden checks are counted and reported,
  never applied, and an incomplete pair is never approved silently.

<a id="i-16"></a>
* **I-16 (selection V2, RULE 24):** the zoom slider, the row height and the
  thumbnail height are one value; moving the slider changes all three in the
  same render, and the stored value survives a restart.

<a id="i-22"></a>
* **I-22 (scan, RULE 3/4/24):** a scan is a pure function of the file set and
  commits once: enumeration order can never change a pair, its id, its AI side
  or the list order; an unreadable file is a status (never a fabricated size,
  never "changed"/"gone"); an approved **listed** source is never hidden while a
  file of its own is only missing (a source with no AI image is not a row at all
  — see I-31 — and is reported with its reason); a scan writes nothing into the
  scanned root; a superseded scan and an unchanged snapshot both commit nothing.
  Image-regeneration history is not a new pair: only canonical positive `_AI_vN.png`
  files directly in `AI source regeneration versions` (case-insensitive, including
  when that folder is the picked root) are omitted from review; lookalikes elsewhere
  and unrelated files in that folder are not hidden.

<a id="i-40"></a>
* **I-40 (the scope is visible, RULE 12):** both Selection toolbars state the
  scope the scan used and, when it hides pairs, how many are not listed
  ("Scope: split output only · N pair(s) in the main folder not listed" /
  "Scope: whole folder — no split output found"), and the Generate SVG list
  reports the same items as `outside-split` exclusions in its banner, audit and
  log. A user never has to guess why the list is shorter than the folder.

<a id="i-41"></a>
* **I-41 (one file per pair, RULE 3/13):** a pair's metadata is a single JSON in
  the folder that holds the pair, named after the AI image's stem
  (`<stem>.svg.json`). It stores the pair's identity, both image faces, the
  pair's `decision` (may this AI image be generated from?), and one record per
  SVG version with `status`, `review` (is this SVG approved?), prompt,
  provider/model, timestamps, tokens, cost + basis + pricing version, validation
  and the redacted error. No global file holds any of it.

<a id="i-42"></a>
* **I-42 (the migration is read-only, RULE 13):** `<root>/review-decisions.json`
  is read as a fallback for pairs that have no local file and is never written or
  deleted by this build. A scan writes nothing. A legacy `<stem>.svg.json`
  (`v: 1`) keeps its versions, gets the pair identity derived from its stored AI
  face, and is upgraded on its next write. A local file always wins over the
  legacy record — including an explicit `pending`.

<a id="i-43"></a>
* **I-43 (a decision survives the tree, RULE 12/24):** because the record lives
  with the images, an approval travels with a renamed or moved folder; when the
  images are gone the file still reports the pair (`files-missing`); an
  unreadable pair file is named (banner + log + row status) and the in-memory
  decision is kept, never silently turned into `pending`; a failed write keeps
  the decision in memory and `Retry` rewrites exactly the pairs that failed.

<a id="i-55"></a>
* **I-55 (paired thumbnail zoom):** Selection V2 and Generate SVG share the 48–800 px thumbnail range, clamping and two-slot layout (`src/lib/zoom.ts`, `src/ui/PairedThumbs.tsx`). Each image keeps its own aspect ratio, never stretches or upscales beyond its natural size; an 800 px pair scrolls horizontally rather than silently shrinking.
