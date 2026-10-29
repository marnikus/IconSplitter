# Getty Images web-upload automation — research & design (2026-10-29)

**Status: research + design only. No production code was written for this
document.** Nothing here is a working integration and nothing has been run
against a live Getty Images account (see [what is *not* verified](#6-what-this-document-does-not-prove)).

Request this answers: *"Automate uploading through the Getty Images web upload
page: log in with the credentials, go to the upload page, select the files, and
upload them on the web. Do it in the background if possible; if the app cannot,
use the bridge."*

Detail pages:

| Page | Owns |
|---|---|
| [research.md](research.md) | evidence, sources, what is verified vs assumed, probe list |
| [design.md](design.md) | architecture, bridge API, state machine, job journal, selectors, security, TDD plan, acceptance criteria |

---

## 1. Executive summary

1. **The browser app alone cannot do this.** `esp.gettyimages.com` is a
   cookie-authenticated third-party origin: our React app cannot set its
   cookies, read its DOM, or POST its sign-in form (CORS + SameSite + no
   embedding). Every viable design therefore runs on **this machine, outside
   the tab** — exactly the split the repo already uses for Inkscape, FTPS, SFTP
   and the ESP `esp-https` API.
2. **The right vehicle is the existing loopback bridge** (`tools/bridge/`), not
   a new server and not a browser extension in phase 1. The bridge already owns
   `127.0.0.1:47391`, an origin allowlist, byte-limited bodies, secret redaction
   and the local credential vault pattern. It gains a *web driver* (attach to a
   real Chrome over CDP, or drive a Playwright-managed persistent profile when
   the optional driver is installed).
3. **Two session modes, one job pipeline.** *Attach* (recommended default): the
   user signs in to `esp.gettyimages.com` once in their own Chrome; the bridge
   attaches through `--remote-debugging-port` and never sees a password.
   *Credential* (what the request literally asks for): the user opts in, the
   password is read from the existing IndexedDB vault, sent over loopback in the
   request body only, typed into the live form, and never stored, logged or
   written to disk.
4. **"Background" is achievable, with an honest definition.** With a
   Playwright-managed persistent profile the run continues headless while the
   user works elsewhere; with CDP attach it continues while the browser window
   is minimised/occluded. The bridge owns the job, so closing the IconSplitter
   tab does not abort it — the tab re-attaches and reconciles from the job
   journal.
5. **The high-risk parts are policy and fragility, not code.** Getty publicly
   named the tools it accepts (ESP itself, the Contributor app, DeepMeta,
   qHero) and terminated StockSubmitter's submissions in 2018. ESP ships DOM
   changes several times a year (DeepMeta's own changelog records breaking
   changes in Dec 2025 and "cannot transition via 'mark for review'" errors in
   Jul 2026). The design therefore: never submits for review
   (`submit: false` default), never solves a CAPTCHA/2FA, pauses to a
   `needs-human` state instead of guessing, rate-limits itself, verifies every
   file against the live batch list before recording success, and is **opt-in,
   per-run confirmed, and off by default**.
6. **Recommended rollout:** phase 1 keep the existing sanctioned path (staged
   `esp-batch` folder + DeepMeta/ESP drag-and-drop + CSV) and add only the
   *preflight + staged-batch + one-click "open batch page"* automation; phase 2
   the CDP-attach uploader; phase 3 headless credential mode; in parallel ask
   Getty Contributor Support whether the workflow is acceptable — the only
   durable answer is partner/API approval, which is how DeepMeta exists.

---

## 2. What Getty actually offers today

| Route | Who can use it | Fit for IconSplitter |
|---|---|---|
| **ESP web uploader** — `https://esp.gettyimages.com/sign-in?returnUrl=/upload` | every contributor with ESP access | what this document automates; unsanctioned for third-party tools |
| **DeepMeta** (Getty-blessed, free) | every contributor | sanctioned; accepts a folder/CSV drop; the honest baseline |
| **qHero** (commercial) | every contributor | sanctioned; another baseline |
| **Contributor mobile app** | photos only, no illustrations | not applicable |
| **ESP Submission/Ingestion API** (`api.gettyimages.com/esp/...`) | partners with ESP API access | already implemented in this repo (`esp-https`), needs Getty-granted access |
| **FTP/FTPS/SFTP** | does not exist for creative illustrations | not applicable (repo already documents this) |

The ESP sign-in page and the protected `/upload` route were re-verified on
2026-10-29; see [research.md §2](research.md#2-verified-facts-2026-10-29).

## 3. Why the browser cannot do it, and why the bridge can

- **Cross-origin cookies.** ESP auth is a first-party session cookie for
  `esp.gettyimages.com`. `fetch` from `file://` or `localhost` sends no such
  cookie (`SameSite`, third-party cookie blocking, CORS preflight) and cannot
  read `Set-Cookie`. The app also cannot send `Origin: https://esp.gettyimages.com`
  without lying.
- **No click-through surface.** Getty does not allow framing (`X-Frame-Options`
  / CSP), and a cross-origin iframe would still be an opaque document we cannot
  script, cannot fill and cannot read.
- **Automation needs a browser process.** Typing credentials, choosing files,
  observing upload progress and reading the resulting batch rows require a real
  browser context. That process must live where the files live — the user's
  machine — hence the loopback bridge (`tools/bridge/`, `127.0.0.1:47391`,
  loopback-only, origin-allowlisted, no dependencies).
- **Why not a Chrome extension?** It *can* reuse the user's live session, but it
  needs a fixed extension ID, a store or unpacked-install ritual, its own
  permissions review, and it cannot run when the browser is closed. It is
  documented as alternative **B** in [design.md §3](design.md#3-alternatives-considered);
  the bridge is preferred because it already exists, is testable, and can run
  headless.

## 4. Shape of the proposed feature

1. **Preflight (browser, pure).** For the selected rows: pair completeness
   (`icon.eps` + `icon.jpg`, same stem), raster specs (RGB JPEG, ≥ 1900 × 2800 px
   for illustrations, ≤ 50 MB), EPS present, batch size ≤ 100 files, unique
   filenames, metadata present (title/description/keywords), and a *policy
   warning* when the asset was AI-generated. Nothing is uploaded if a blocking
   check fails.
2. **Stage (bridge).** Bytes are streamed from the app to the bridge and written
   to a private temp folder — the same "browser sends bytes, guard writes files"
   contract as FTPS/SFTP/ESP today — so the browser context can attach files by
   path. `_getty_web_jobs/` and the temp folder are outside `export/` so
   discovery (`I-80`) never re-reads them.
3. **Session (bridge).** Attach to a running Chrome via CDP, or launch a
   Playwright persistent profile. Optional credential login types the vault
   password into the live form. Missing session, CAPTCHA, 2FA, unknown
   interstitial ⇒ job pauses as `needs-human` and the UI says exactly what to
   finish in the browser window.
4. **Upload (bridge).** Open the upload page, select the content type from the
   **live dropdown** (never a hardcoded guess), create/reuse a batch, attach the
   files (file-input → file-chooser interception → drag-event fallback), then
   poll the batch list until every filename is present and processed.
5. **Verify, then record.** A file counts as uploaded only when the live page
   shows it in the batch (name + type). Only then does `export`-level stock
   history move to `uploaded` and the `Getty Images` badge is assigned. Partial
   runs stay `partial`; an interrupted run is `interrupted`, never `uploaded`.
6. **Never submit.** The review submission step stays a human action; the design
   documents where the button is and refuses to click it.

## 5. Cost, risk and blast radius

| Risk | Consequence | Mitigation in this design |
|---|---|---|
| Getty treats tooling as unauthorised | account action / rejected submissions | opt-in, off by default, human submits, no CAPTCHA bypass, no multi-account, rate limited; ask support for approval first |
| ESP DOM changes | silent wrong clicks | live selector self-check before any action; versioned selector pack; `needs-human` on any mismatch; failure tests |
| Upload without metadata | rejected files or empty keywords | embedded XMP/IPTC already written by this repo; optional CSV apply; verification stops if keyword count is 0 |
| Duplicate uploads on retry | duplicate-content rejection | sha256 + filename journal, batch state read before every retry, no blind retry |
| Credential leakage | account compromise | loopback-only, pairing token, in-memory only, reuse of `redactCredentials`, no logging of bodies/headers/cookies |
| Batch rules (100 files, 90-day closure) | stuck files | split into named batches, batch id persisted and reused |
| AI content policy | submissions refused, account risk | preflight warning; docs state Getty's published position and require the user to decide |

## 6. What this document does *not* prove

- No live download/upload, no ESP account, no browser session was used here.
  The sandbox cannot reach Getty hosts and holds no credentials.
- Selector strings, exact content-type labels, the presence of a
  `input[type=file]`, CAPTCHA/2FA behaviour, upload endpoint shape and session
  lifetime are **unverified**. They are treated as *runtime-discovered
  contracts* and every one of them has a probe and a fail-closed behaviour in
  [research.md §5](research.md#5-open-questions--probe-list).
- No claim is made that Getty permits this. The document states the evidence
  and recommends asking Getty before enabling the feature for anyone.
- Do not repeat the mistake recorded in
  `docs/archive/2026-10-29-getty-esp-ingestion/README.md`: a self-consistent
  local fake server is not an integration. Tests here prove *our* logic and
  *fail-closed* behaviour; a live run in the user's environment is the only
  acceptance evidence.
