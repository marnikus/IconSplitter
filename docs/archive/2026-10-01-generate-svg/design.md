# Generate SVG — implementation design (2026-10-01)

## Sources and scope

Visual references: `design temp/SVG tab generation/SVG generation Tab.html` and
`design temp/SVG tab generation/Generate SVG workspace.png`. The workspace reuses
Selection V2's paired list, independent active-row/check selection, visible-only
bulk actions, range zoom, global History bar and semantic accessibility patterns.

The new fifth Workbench tab reads the same recursive Selection root and decision
file. It is not a second approval system: only currently approved AI results are
eligible. It does not change batch splitting or Selection decisions.

## Privacy boundary

Repository RULE 20 was refined for this explicitly requested external API: local
workflows stay local and offline, while Generate SVG may send only after the user
reviews the local plan and clicks **Generate now**. The dialog names the content
being sent: approved contact sheets, the filename/path/position manifest and the
exact prompt. Scanning and preflight are local. No original file, unapproved
image, export, API key, or analytics payload is sent.

The API key is AES-GCM encrypted in IndexedDB by Web Crypto using a
non-extractable key. It is sent only in the Requesty Bearer header and never
enters preferences, global history, sidecars, error strings, visible UI or logs.
The endpoint is pinned to `https://router.requesty.ai/v1`; credentials cannot
configure an arbitrary destination.

## User flow

1. Choose/reuse the Selection root; recursively index only approved AI results.
2. Search, filter generation/review state, sort by date/name/state/review/cost,
   change sort direction, zoom thumbnails, and keep row checks independent of
   the keyboard-active row.
3. Edit the prompt and bounded Requesty settings. Preferences are validated,
   saved locally and undoable in the global timeline.
4. Local preflight fingerprints sources, orders paths deterministically, makes a
   square contact sheet with visible position labels, pairs it with a manifest,
   estimates full serialized request-body bytes, and reduces batches only within
   the configured safe cap.
5. Review exact source count, batch plan, Requesty model, payload sizes, cost
   caveat and prompt; cancel or explicitly send.
6. See bounded-queue progress, request usage, partial failures and unknown
   outcomes. Stop prevents later queued requests; in-flight requests finish.
7. Review every version, inspect sanitized code/history, approve/decline/reset,
   recover a validated interrupted temp, or regenerate as a new numbered version.

Required exact default prompt:

> Create 4 split SVG icons. Snap visually intended connections exactly to curves/anchors. Never leave tiny gaps, floating endpoints, overshoots, or approximate joins. Preserve seamless geometry without breaking the intended image.

Default model: `azure/gpt-6.1-sol@eastus2` at Requesty's OpenAI-compatible Chat
Completions endpoint. The default batch is four images; the schema accepts up to
nine. The default concurrency is one. Vision-token pre-send pricing is not
invented: actual usage/cost is displayed from Requesty's response, and a shared
batch charge is explicitly not allocated per image.

## Deterministic mapping and SVG safety

Each row is sorted by normalized relative path before contact-sheet construction.
The numbered cell and manifest share a one-based `position_id`, exact AI
filename/path, stable source id and SHA-256 fingerprint. Responses are accepted
only when each structured result repeats both position id and exact source title;
missing/duplicate/unknown IDs, mismatched names and invalid SVGs are rejected
individually. Response array order is never a fallback mapping.

SVG handling fails closed: parse one well-formed root, enforce title and positive
viewBox/dimensions, allowlist elements/attributes, strip executable/external
references, render-check visible geometry, and save only the canonical sanitized
markup. Version names are `<stem>.svg`, `<stem>-v2.svg`, etc. The complete file
is staged and verified before atomic no-overwrite promotion. Per-source JSON
sidecars record checkpoints, manifest/prompt/model, response request ids, usage,
validation, source/composite/content hashes and version-level decisions—never
credentials.

## Uncertain outcomes and restart

Before the one network call, each selected source receives a durable in-progress
sidecar checkpoint. Only an explicit 429 response can be retried, with bounded
`Retry-After`/backoff. A timeout, network loss, malformed success or uncertain
server/provider status is recorded as unknown; no automatic resubmission occurs.
Restart converts abandoned in-progress entries to unknown. A later valid orphan
SVG is indexed into sidecar metadata. A staged temp may be promoted only after
current Selection approval, unchanged source fingerprint, sanitization,
renderability and no-overwrite checks all pass. Conflicts/failures retain the
recoverable temp rather than destroying evidence.

## Code boundaries and quality

* `lib/svgcomposite.ts`, `svg/preflight.ts`, `svg/prompt.ts`: image geometry,
  deterministic batches, structured prompt/manifest.
* `svg/requesty.ts`, `svg/responsemap.ts`, `lib/svgvalidate.ts`: pinned transport,
  explicit mapping, security sanitation/render checks.
* `svg/run/*`, `svg/sidecar*`, `svg/files.ts`, `svg/versionindex.ts`,
  `svg/indexer.ts`, `svg/recovery.ts`: queue, checkpoint, atomic files, sidecar
  validation, restart/recovery and current approval checks.
* `svg/ui/*`: controls, filters, active/checked list, dialogs and progress;
  `svg/prefsstore.ts` and `svg/review.ts` own their durable non-secret state.

Every source control uses the existing global history mechanism; prompt/search
and range gestures coalesce. A failed history apply does not advance the cursor.
Core logic is tested with fake filesystem handles/fetch and rendered-SVG shims;
UI smoke tests cover the restored tab and global undo. `docs/current/CODE_VERIFICATION.md`
remains the release gate: types, lint, RULE 16 changed-file quality, full tests,
coverage and single-file production build must pass before push.
