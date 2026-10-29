# Getty web-upload automation — technical design (2026-10-29)

Companion to [README.md](README.md) (summary/decision) and
[research.md](research.md) (evidence, probes). **Design only — nothing here is
implemented.** Phases are ordered so that every phase is shippable, testable and
useful on its own, and so the sanctioned baseline always keeps working.

---

## 1. Constraints the design must satisfy

| Constraint | Source | Design answer |
|---|---|---|
| Browser app cannot drive a third-party origin | platform | work happens in the loopback bridge |
| Loopback only, origin-allowlisted, no dependencies in the bridge | `tools/bridge/server.mjs` | new routes follow the same `cors()`/`readBody()`/`json()` pattern; browser driver is optional and loaded lazily |
| Secrets only in IndexedDB `secrets`, never logged, never in presets/sidecars | `I-81`, `src/lib/stockupload/credvault.ts` | password travels app → loopback once per session, lives in bridge memory only, redacted on every error path |
| `export/` + `export.json` is the only discovery source | `I-80` | job journal and temp files live in `_getty_web_jobs/` / OS temp, never in `export/` |
| Badges and stock history only after a verified upload | `docs/current/sor/stock-upload.md` §4 | verification before state write; `partial`/`interrupted` are explicit outcomes |
| No live provider calls in tests | RULE 20 | fake CDP transport + saved DOM fixtures; live run is a user acceptance step |
| Production files ≤ 300 lines, functions ≤ 30 lines / 4 params / CC 10 / nesting 4 | RULE 16 | module split below; the driver is a small command sequencer, not one big function |
| Uploads are irreversible remote state | 2026-10-29 ESP research | `submit:false` default, dry-run mode, per-run confirmation token, preflight before bytes move |

## 2. Architecture

```
┌───────────────────────── browser tab (React app) ─────────────────────────┐
│ Upload tab (stockUpload)                                                  │
│  • gettyweb preflight (pure): pairs, specs, batch split, metadata, policy  │
│  • GettyWebDialog: session state, batch choice, per-run confirmation       │
│  • job polling (1 s) + progress rows + cancel                              │
│  • on verified rows only → stock history `uploaded` + Getty badge          │
└───────────────▲───────────────────────────────┬───────────────────────────┘
                │ JSON (loopback, pairing token) │ file bytes (streamed)
┌───────────────┴───────────────────────────────▼───────────────────────────┐
│ tools/bridge (127.0.0.1:47391)                                            │
│  getty/routes.mjs      HTTP surface, auth token, size caps, redaction      │
│  getty/job.mjs         job model, journal, resume, cancel, verification     │
│  getty/stage.mjs       bytes → private temp dir, sha256, cleanup           │
│  getty/selectorpack.mjs  versioned selector config + self-check            │
│  getty/driver/*.mjs    transport-agnostic page command interface           │
│     cdp.mjs            attach to real Chrome (no dependency, node:WebSocket)│
│     playwright.mjs     optional persistent-profile driver (lazy import)    │
│  getty/verify.mjs      read batch rows, match names, detect error badges   │
└───────────────▲───────────────────────────────────────────────────────────┘
                │ CDP (ws://127.0.0.1:<port>/devtools/...) or Playwright
        ┌───────┴────────┐
        │ real browser   │  esp.gettyimages.com (user's own session/profile)
        └────────────────┘
```

### 2.1 Two session modes, one driver interface

| Mode | How it starts | Credential handling | Background capability |
|---|---|---|---|
| **attach** (default) | user runs Chrome once with `--remote-debugging-port=9222 --user-data-dir=<dedicated profile>` and signs in to ESP; bridge connects to `http://127.0.0.1:9222/json/version` | none — the browser already holds the session | runs while the window is minimised/occluded; needs the browser process alive |
| **managed** (opt-in) | bridge launches `chromium.launchPersistentContext(profileDir, {headless: true})` via the optional `playwright-core` install, or launches the installed Chrome/Edge with CDP if the driver is absent | optional: username/password from the vault typed into the live sign-in form | true background; no visible window in headless mode |

Both modes implement the same small command set, so job logic is driver-agnostic
and testable against a fake:

```js
// getty/driver/contract.mjs
open(url)                      // navigate, return final URL
signedIn()                     // false when the URL is /sign-in or the form is present
typeCredentials(user, pass)    // only in managed mode with explicit opt-in
select(label, option)          // <select>/listbox by accessible label
click(role, name)              // button/link by accessible name, never by CSS path
attachFiles(paths)             // input → file chooser → drag fallback
texts(selectorKey)             // read a text list (batch rows) for verification
waitFor(predicate, timeoutMs)  // bounded
screenshotlessFailure(reason)  // no page content is ever returned to the app
```

`attachFiles` fallback order (all via CDP, S14): `DOM.querySelector` for a file
input (including hidden) → `Page.setInterceptFileChooserDialog` +
`DOM.setFileInputFiles` with the emitted backend node id → `Input.setInterceptDrags`
+ `Input.dispatchDragEvent` with a `files` array. No OS dialog automation, ever
(it is Windows/macOS-specific, needs a foreground window, and cannot be tested).

### 2.2 Selector pack (the fragile part, contained)

`getty/selectorpack.mjs` exports one **versioned** object:

```js
export const PACK = {
  v: 3,                                    // bump whenever ESP changes
  signIn:    { user: "label:Username", pass: "label:Password", submit: "role:button:Sign in" },
  upload:    { typeSelect: "label:Content type", newBatch: "role:button:New submission",
               dropzone: "text:Click or drag and drop files here", fileInput: "css:input[type=file]",
               applyCsv: "text:Templates", saveToast: "text:Saved successfully" },
  batch:     { rows: "css:[data-testid],article,li", rowName: "text" },   // discovered live, see Q10
  submit:    { button: "role:button:Submit" },                            // documented, never used
};
```

Rules:

1. **Self-check before every job** — the page must resolve *all* keys the job
   needs (`upload.typeSelect`, `upload.newBatch`, one attach path, `batch.rows`).
   Any miss ⇒ `needs-human` with a neutral reason ("the ESP page has changed —
   selector pack v3 no longer matches"), never a guessed click.
2. **Accessible names and labels first**, CSS last, structural paths never.
3. A pack is **configuration, not code**: overridable from
   `iconSplitter.stockUpload.gettyWeb.v1` so a user can re-point without a build.
4. Nothing in the pack is claimed to be correct today — Q4/Q5/Q10 must fill it in
   from a live session ([research.md §5](research.md#5-open-questions--probe-list)).

## 3. Alternatives considered

| Option | How it would work | Why not the default |
|---|---|---|
| **A. Loopback bridge + CDP/Playwright** (chosen) | as above | needs a browser process on the user's machine; otherwise best fit (already exists, testable, headless-capable) |
| **B. Chrome MV3 extension** | content script on `esp.gettyimages.com` reuses the user's live session, `chrome.scripting` + `fetch` with host permission | no background run when Chrome is closed; fixed extension ID / install ritual; own store-review and permission surface; cannot read local export bytes without a native host anyway; harder to test in CI |
| **C. Bookmarklet / userscript** | user pastes a script on the ESP page | cannot read local files; no progress channel back to the app; unmaintainable |
| **D. Cookie/session replay from the app** | sign in via bridge, copy cookies, call ESP JSON endpoints directly | undocumented endpoints, would still need a browser to sign in, and exfiltrating session cookies is a worse security story than keeping them in the browser; revisit only if Q6 shows the flow is stable *and* Getty approves |
| **E. Official ESP API (`esp-https`, already shipped)** | Bearer token to `/esp/submission/v1` + multipart ingestion | only for API-approved partners; keep as the preferred path for anyone who has it |
| **F. Sanctioned staging (`esp-batch`, already shipped)** | write the folder + CSV, let DeepMeta/ESP ingest it | fully sanctioned but manual; the honest fallback and the phase-1.5 automation target |

## 4. Bridge HTTP surface (new routes, additive)

All routes require the existing CORS allowlist **and** the new pairing header
`x-getty-token` (see §7). Bodies are JSON except file bytes.

| Route | Body / query | Response |
|---|---|---|
| `GET /getty/status` | — | `{ driver: "cdp"\|"managed"\|null, browser: {attached, version?}, session: "signed-in"\|"signed-out"\|"needs-human"\|"unknown", packVersion, jobs:[{id,state}] }` |
| `POST /getty/attach` | `{ cdpUrl?: "http://127.0.0.1:9222", profileDir?: string, headless?: boolean }` | `{ ok, driver, session }` — rejects non-loopback `cdpUrl`, refuses `username`/`password` in the URL |
| `POST /getty/session/login` | `{ username, password }` | `{ ok, session }`; typed into the live form, never stored; 401/`needs-human` on CAPTCHA/2FA |
| `POST /getty/session/logout` | — | closes the managed context, clears in-memory credentials; does **not** delete the user's profile |
| `POST /getty/jobs` | `{ batch: {typeLabel, name, briefCode?, notes?}, files:[{name, kind, sha256, bytes}], options:{applyCsv, submit:false, dryRun:true\|false} }` | `202 { jobId }`; `409` when a job is already running (single-flight) |
| `POST /getty/jobs/:id/file/:name` | raw bytes, `content-type: application/octet-stream` | `{ ok, staged, sha256 }` — streamed with an explicit cap |
| `GET /getty/jobs/:id` | — | state + per-file rows (see §5) |
| `GET /getty/jobs/:id/events` | — | optional SSE progress (`text/event-stream`); polling is the fallback |
| `POST /getty/jobs/:id/start` | — | begins the upload after all files are staged |
| `POST /getty/jobs/:id/cancel` | — | cooperative cancel; already-uploaded remote files are **not** deleted, and the journal records that |
| `POST /getty/jobs/:id/human-done` | — | user attests they finished the interactive step (sign-in, CAPTCHA); the job re-checks the page before continuing |

Existing `/health` gains
`gettyWeb: { driver, session, packVersion, enabled }`.

Caps: `BRIDGE_GETTY_MAX_FILE_BYTES` (default 50 MB, matches the published
ceiling, S1), `BRIDGE_GETTY_MAX_JOB_BYTES` (default 1 GB), `BRIDGE_GETTY_TIMEOUT_MS`
(default 900 000), one job at a time.

## 5. Job state machine

```
preflight ─▶ staging ─▶ needs-session ─▶ opening-upload ─▶ batch-ready
                                  ▲                        │
                                  │                    uploading (per file)
                          needs-human ◀── any mismatch    │
                                  │                        ▼
                                  └── human-done ─▶ processing ─▶ verifying ─▶ done
                                                                      │
                                                     partial | unverified | cancelled | failed
```

Per-file row: `{ name, kind, sha256, staged: bool, sent: bool, seenInBatch: bool,
error: string|null, status: "queued|sent|processing|recognised|error" }`.

**Truth rule:** `sent` (bytes accepted by the page) is *not* success.
`recognised` requires the filename to appear in the live batch list **and** no
error badge on its row (Q10). `done` requires every file `recognised`. Anything
else is `partial`, `unverified`, `interrupted` or `failed` — and the history
outcome strings already exist for those (`StockUploadOutcome`).

Timeouts: page actions 20 s, batch row appearance 10 min per file, whole job
30 min (configurable). Every wait is bounded and produces a stated reason.

## 6. Journal, resume and idempotency

`<root>/_getty_web_jobs/<jobId>.json`, validated on read (RULE 13), atomically
written (tmp + rename):

```json
{ "v": 1, "jobId": "gw-20261029-1", "createdAt": "…", "state": "uploading",
  "mode": "attach", "batch": { "typeLabel": "…", "name": "icons-2026-10-29", "id": null },
  "packVersion": 3, "files": [{ "name": "icon-a.eps", "kind": "vector",
  "sha256": "…", "status": "recognised", "error": null }],
  "notes": ["cancelled by user after 3/12 files"] }
```

- No credentials, cookies, tokens, page HTML or signed URLs are ever written.
- Resume: if `<root>` has a journal in a non-terminal state, the UI offers
  "continue" — it re-reads the live batch, matches by name + sha256, uploads only
  the missing ones, then re-verifies.
- Duplicate protection: preflight rejects duplicate filenames inside a job; the
  bridge re-reads the batch before each retry and skips names already present.
- Batch reuse: the batch id/label captured from the page is persisted so a later
  run adds to the same batch (up to 100 files) instead of spawning a new one;
  `>100` files split into `<name>-1`, `<name>-2`, … in the preflight plan.
- Temp staging directory is OS-temp, deleted on terminal state unless
  `BRIDGE_GETTY_KEEP_STAGE=1`.

## 7. Security

1. **Pairing token.** The bridge prints a random token on start (and appends it
   nowhere); the app reads it from the `/health` response it already polls at
   first run and keeps it in memory. Rationale: today any local page can POST to
   `127.0.0.1:47391` (the allowlist accepts every loopback origin, including a
   random page the user visits). Adding "upload to your stock account" to that
   surface needs a capability check.
2. **Credentials in flight only.** Vault → `POST /getty/session/login` →
   typed → buffers zeroed. Never returned, never logged, never journaled.
   `redactCredentials()` wraps every error string; query strings are already
   stripped from the bridge log.
3. **Loopback attach only.** `POST /getty/attach` accepts `http://127.0.0.1:…`,
   `localhost` and `[::1]` with no userinfo/path/query; a remote CDP endpoint is
   refused with an explanation (it would expose the user's browser to the
   network, and it would be a different machine from the files).
4. **No page content out.** The app receives states, filenames, counts and
   neutral reasons — never HTML, never cookies, never screenshots (matching the
   Adobe validator's rule).
5. **Profile ownership.** Attach mode never writes to the user's profile;
   managed mode uses a dedicated directory outside the repo
   (`%LOCALAPPDATA%/IconSplitter/getty-profile`), documented as *not* a place to
   sign in to anything else.
6. **Opt-in, confirmed, single-flight.** `gettyWeb.enabled` is off by default; a
   job requires an explicit confirmation dialog that lists the exact files and
   the target batch; a second job cannot start while one runs.

## 8. App-side modules and ownership

| File | Owns | Notes |
|---|---|---|
| `src/lib/stockupload/gettyweb/spec.ts` | pure spec validation: RGB/JPEG, px bounds, MB cap, EPS presence, pair naming, 100-file split | no I/O, fully unit-tested (RULE 8) |
| `src/lib/stockupload/gettyweb/plan.ts` | selection → job plan (ordered files, batch names, dedupe, policy warnings incl. AI-content flag) | ≤300 lines |
| `src/lib/stockupload/gettyweb/client.ts` | typed wrapper over `/getty/*`, pairing token, error mapping, no secret in URL | mirrors `bridgeclient.ts` style |
| `src/lib/stockupload/gettyweb/state.ts` | job status → row status → `StockSiteStatus`, validate-on-read persistence | owns `iconSplitter.stockUpload.gettyWeb.v1` |
| `src/stockupload/GettyWebDialog.tsx` | session mode, batch fields, confirmation, progress, cancel | `data-testid="stock-getty-web-*"` |
| `src/stockupload/runupload.ts` (extend) | new target kind `getty-web` in the existing multi-target runner | one branch, not a second runner |
| `tools/bridge/getty/routes.mjs` | HTTP surface + caps + token | ≤300 lines |
| `tools/bridge/getty/job.mjs` | state machine, journal, resume | ≤300 lines |
| `tools/bridge/getty/stage.mjs` | stream → temp, sha256, cleanup | small |
| `tools/bridge/getty/selectorpack.mjs` | versioned selectors + self-check | config-only |
| `tools/bridge/getty/driver/cdp.mjs` | dependency-free CDP client (`node:WebSocket`) | ≤300 lines, commands ≤30 lines |
| `tools/bridge/getty/driver/playwright.mjs` | lazy `import("playwright-core")`, persistent context, same contract | optional dependency, not in `package.json` |
| `tools/bridge/getty/driver/fake.mjs` | scripted fake transport for tests only | test-only code path |
| `tools/getty-web-upload.mjs` | optional CLI: `--attach <cdp> --batch <name> --files <glob> [--dry-run]`, requires `--allow-upload` | same shape as `tools/adobe-stock-acceptance.mjs` |

New persisted keys: `iconSplitter.stockUpload.gettyWeb.v1`
(`{enabled, mode, cdpUrl, profileDir, contentTypeLabel, batchName, applyCsv,
maxFilesPerBatch, maxFileBytes, submit:false}` — validated on read, defaults
restored on corruption). Credentials stay in the existing
`stock-ftp-cred:getty-images` vault slot.

## 9. UI contract (Upload tab, Getty preset)

- Target row adds **`Getty web`** next to `es HTTP / FTP` targets; disabled with
  the reason "enable Getty web upload in settings" until opted in.
- Dialog, top → bottom: mode (Attach / Managed) → session pill
  (`Signed in · session expires unknown`) → content type (from the live list,
  read-only when a job is running) → batch (reuse existing / new name / brief
  code) → file summary (`12 files · 2 batches · 26.4 MB`) → metadata source
  (`embedded XMP/IPTC` / `+ CSV apply`) → `Upload N files to <batch>` primary
  button, `Dry run` secondary, `Cancel`.
- Failure copy is specific and never blames the user's account:
  *"ESP did not show the expected upload controls — selector pack v3 needs
  updating (nothing was uploaded)."*
  *"Sign-in needs you: finish the verification step in the Getty window, then
  press Continue."*
  *"3 of 12 files are in the batch, 1 shows an error, 8 were not sent."*
- Empty/blocked states are honest results, not errors (RULE 4): no browser
  attached, not signed in, no eligible files, all files already uploaded.

## 10. Test plan (no live calls)

| Layer | Tests |
|---|---|
| pure spec/plan | pair naming, missing EPS, 1900×2800 boundary, 50 MB boundary, 100-file split, duplicate names, AI-policy warning, ordering determinism |
| state mapping | `recognised ⇒ uploaded`, `partial/interrupted ⇒ not uploaded`, no badge before verification, journal validate-on-read rejects corrupt/old versions |
| client | pairing token required, 409 single-flight, non-loopback attach refused, error strings redacted (assert logs never contain the password) |
| driver contract (fake) | command order, bounded waits, `needs-human` on every self-check miss, cancel propagation, no attach path available |
| CDP driver (fake ws server) | message framing, `DOM.setFileInputFiles` fallback chain, file-chooser interception, drag fallback, timeout ⇒ stated reason |
| selector pack | a saved, **sanitized** ESP DOM fixture resolves every key; a mutated fixture must *fail closed* (this is the anti-brittleness test) |
| CLI | refuses without `--allow-upload`; refuses non-loopback CDP; refuses when no session |

Explicitly not a test: "it worked against Getty". That is the acceptance run in §11.

## 11. Implementation order (TDD, each step green before the next)

1. **Phase 1 — sanctioned automation only (no browser driver).** Preflight
   (`spec.ts`, `plan.ts`), reuse/extend `esp-batch` staging, CSV generation
   (`gettycsv.ts` already exists), and a `Getty web` target that stages and
   offers "open ESP in your browser" + "copy CSV". Zero policy risk, immediate
   time saving, own tests.
2. **Phase 2 — CDP attach, dry run.** `driver/contract`, `cdp.mjs`, selector
   pack + self-check, `attach` route, read-only walk (open upload page, assert
   controls, list batches) with `dryRun:true`. No file leaving the machine.
3. **Phase 3 — upload with verification.** Staging route, job/journal, attach
   files, batch creation, verification, history/badge writes, cancel/resume.
   Still `submit:false`, still attach-only, still opt-in.
4. **Phase 4 — managed/headless + credential login.** Optional
   `playwright-core`, persistent profile, vault → live form, `needs-human` for
   CAPTCHA/2FA. This is the mode that satisfies "background with credentials";
   it ships last because it is the most sensitive.
5. **Phase 5 — docs & gating.** Current pages: new
   `docs/current/sor/stock-upload-web.md` (≤9 KB, linked from the router row),
   selector handles in `selectors/stock-upload.md`, storage + tests + owners
   pages, a new invariant ("a web-upload row is `uploaded` only after the live
   batch shows it"), and `design/getty-web-upload/SPEC.md` if any new dialog
   copy precedes the build.

## 12. Acceptance criteria (live, user-run)

A run counts as accepted only when **all** hold, recorded with screenshots the
user chooses to share (never committed):

1. `--allow-upload` (or the dialog confirmation) present, and a dry run passed
   first in the same session.
2. Sign-in happened; no credential appeared in any log, journal or error string
   (grep the bridge log and `_getty_web_jobs/*.json`).
3. A batch of ≥ 3 pairs uploaded; each file appears in the live batch list; the
   app's per-file statuses match what the browser shows for every file.
4. No file was submitted for review; the ESP page still shows the batch in its
   pre-submission state.
5. Cancelling mid-run leaves `partial`/`interrupted` (never `uploaded`) and a
   re-run uploads only the missing files.
6. A repeated run with the same files performs zero uploads.
7. If ESP shows an unexpected control, the job stops as `needs-human` with the
   selector-pack message and uploads nothing further.

Until that evidence exists, the feature's status is **designed, unverified** and
the UI must say so.
