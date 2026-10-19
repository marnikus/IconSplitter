# Browser API-key store

Dated, opt-in context from the former system-of-record sections. If a dated explanation conflicts with a current invariant or implementation, the current contract wins; do not treat a superseded mechanism as live behaviour.

## 20. The API key that was saved and then gone (2026-10-07)

Report: the key "shows API saved" and is "stored locally", yet the app asks for
it again as soon as anything changes — an edit, a tab switch — and only a
freshly pasted key works; requests come back `400 API key not valid. Please pass
a valid API key.`

Measured cause, three faults in one path, all in how the key was kept:

* **A leaked IndexedDB connection per operation.** The store opened a new
  connection for every read and every write and closed none. The handles piled
  up, and a handle left open blocks any later version upgrade of the same
  database: the second tab's (or a new build's) `open` waits on `onblocked`,
  which the code answered with "no storage". So the key was written into a page
  that then had no working storage, and the next boot read nothing.
* **An empty Save that really wiped.** Saving with an empty field wrote
  `{key: null}` — clicking Save on a card whose draft had already been spent
  destroyed the key that was there.
* **A failed read that looked like an empty one.** Every failure path answered
  "no key", so a store that merely could not be read sent the user to paste a
  key the app was still holding.
* **The folder scan overwrote the key in memory.** The upload tab's scan takes
  its refs bag from the panel, and its `key` field was the *snapshot* key — so
  every scan wrote the folder's fingerprint (`6bcab92d`) into the ref that holds
  the API key. The card went on saying "secured locally" (its state comes from
  the boot read, which is correct) while the request carried the fingerprint as
  its key, and the provider answered exactly what the field reported:
  `400 API key not valid. Please pass a valid API key.` — appearing only after a
  tab switch, because returning to the tab is what runs the scan. The field is
  now named `scanKey` in both tabs (`SvgRefs.scanKey`, `UploadRefs.scanKey`,
  `UploadScanRefs.scanKey`): `key` means the provider key, and nothing else may
  be called that.

Now (RULE 10/20, `lib/keyvault`):

* the page keeps **one** connection, closes it the moment another tab needs the
  database (`versionchange`) and reopens on demand; a connection that errored,
  closed, was blocked or was taken away is never reused;
* `save("")` is `empty` — it changes nothing, and clearing is the separate,
  deliberate `Forget`; the editor's Save is disabled while the field is empty
  and the draft is dropped when the editor closes;
* `read()` reports **where the key came from**, and the UI says it: `device`
  ("secured locally"), `session` ("kept for this session only — paste again
  after a reload"), `unreadable` ("storage could not be read" / "this device's
  storage is unreadable here (private mode?)") and `none` ("no key yet"). A
  write the browser refused keeps the key usable for the session and says so;
* the key itself never changes place: still one IndexedDB slot per provider,
  masked in the UI, redacted from logs, never in a URL, a preset or an export.

Measured, not guessed: the regression test drives the real panel through the
real metadata request and asserts the header the provider receives — a tab
switch, then the send. Before the fix the header read `6bcab92d` (the scan's
snapshot hash); after it, the saved key. The same invariant is pinned at the
scan's own seam (`upload_scan.test.ts`: a scan writes `scanKey` and leaves the
`key` ref beside it untouched).

Honesty note: a key that the provider itself rejects is a different case — this
fix is about a key the app already holds, and a wrong or revoked key still
answers `400` from the provider.
