# Getty web-upload automation — research & evidence log (2026-10-29)

Companion to [README.md](README.md) and [design.md](design.md). Every claim is
tagged **V** (verified by direct observation today), **S** (secondary source,
readable but third party) or **A** (assumption / unverified). Timestamps are
2026-10-29.

---

## 1. The question

Can IconSplitter upload exported icons through **Getty Images' own contributor
web uploader** — log in with the account credentials, open the upload page,
select the exported `.eps` + `.jpg` files and upload them — preferably in the
background, and through the local bridge if the browser app cannot do it itself?

## 2. Verified facts (2026-10-29)

| # | Fact | Evidence |
|---|---|---|
| V1 | The contributor portal is `esp.gettyimages.com`; every protected route redirects to `/sign-in?returnUrl=<path>`. Requesting `/upload` redirects to `/sign-in?returnUrl=/upload`. | direct request of `https://esp.gettyimages.com/` and `https://esp.gettyimages.com/upload` |
| V2 | The sign-in page is a plain username/password form ("Username", "Password", a single "Sign in" submit) with a link for new contributors. No OAuth/SSO button was served to an unauthenticated client. | direct request of `https://esp.gettyimages.com/sign-in` |
| V3 | `esp.gettyimages.com/robots.txt` allows ordinary crawlers everywhere except `/contact`, and blocks known AI crawler user agents (`GPTBot`, `ClaudeBot`, `Claude-Web`, `CCBot`, `PerplexityBot`, `Google-Extended`-style list, `imagesift`, `diffbot`, `YouBot`, …). It says nothing about authenticated user-driven automation. | direct request of `https://esp.gettyimages.com/robots.txt` |
| V4 | This repo already owns the sanctioned alternatives: `esp-batch` (local staging folder + `getty_esp_metadata.csv`) and `esp-https` (OAuth PKCE + `/esp/submission/v1` + `/esp/ingestion/v1`), and documents that Getty issues that API access only to approved partners. | `docs/current/sor/stock-upload.md`, `tools/bridge/esp/*`, `docs/archive/2026-10-29-getty-images-upload/README.md` |
| V5 | The bridge is loopback-only, origin-allowlisted (`null`, `localhost`, `127.0.0.1`), dependency-free, already streams large bodies with byte caps, and already has modes for FTPS/SFTP/ESP. Adding a browser driver fits its existing security model. | `tools/bridge/server.mjs` |
| V6 | The repo already ships the two optional-driver patterns we need: a CDP-attached real-browser validator for Adobe (`tools/adobe-stock/browser.mjs`, `chrome --remote-debugging-port`, explicit `--allow-upload`) and pure, testable contract modules for selector/response validation. | `docs/current/sor/upload-adobe-validation.md`, `tools/adobe-stock/*` |
| V7 | Metadata carriers are already solved locally: the app embeds XMP/IPTC/RDF into the exported `.jpg`/`.eps`, which is what ESP's server-side extraction reads. | `src/stockupload/metaembed.ts`, `docs/current/sor/upload-file-metadata.md` |
| V8 | The browser cannot reach the portal: no cross-origin cookies, no framing, no access to another origin's DOM. This is a platform constraint, not a missing feature. | browser security model; consistent with the Adobe validator's design |

## 3. Secondary sources (third party, readable, not authoritative)

| # | Finding | Source |
|---|---|---|
| S1 | Getty's published submission requirements for illustrations: EPS must be **CS6 compatible** with closed shapes/stray points removed/effects expanded; the vector **must be paired** with a high-quality raster illustration saved as **RGB JPEG**, minimum **1900 × 2800 px**, recommended **4075 × 4075**; **paired files must share the same file name** (`illustration.eps` + `illustration.jpg`); stills ≥ 3 MP and ≤ 256 MP. | Getty contributor help, "Preparing Your Content", `contributors.gettyimages.com/article/9146` |
| S2 | Illustration/vector work is submitted through **ESP**, not the mobile Contributor app (which is creative stills only). | PixTagger 2026 contributor guide, `stockpixtagger.com/blog/getty-istock-contributor-guide` |
| S3 | Getty's contributor tooling partner constraints: DeepMeta's uploader creates/uses an ESP **submission batch** (max **100 files**, auto-closed after **90 days** of inactivity), syncs metadata both ways, looks keywords up live in the Getty vocabulary, caps terms at **50**, and treats **submission** as a separate step from **upload**. | DeepMeta docs: `deepmeta.com/3/userguide/batches`, `deepmeta.creativ.zone/blog/post/deepmeta-uploads` |
| S4 | DeepMeta logs in to ESP by opening the **user's browser** for authorisation and keeping a persistent session; its privacy policy says it **collects and uses the ESP username/password**, stored encrypted on the client when the user enables it, exchanged only with Getty servers over HTTPS. So "a third-party app keeps an ESP credential to drive ESP" is a model Getty's own blessed tool uses — with Getty's cooperation. | `deepmeta.com/3/userguide/login`, `deepmeta.com/privacy` |
| S5 | DeepMeta 4 has moved to a browser-based app that uploads via a **server** backend, with an "Uploads" panel that keeps running while the user navigates, multi-account ESP linking, and a changelog full of ESP-side breaking changes (Dec 2025 "Editorial Use Only checkbox always resets", Jul 2026 ESP returning an empty keyword locale, "cannot transition via 'mark for review'" transient errors, 2026 keyword-lookup image size limit requested by Getty devs). Direct evidence that ESP is actively changed and that an external tool must tolerate drift. | `deepmeta.creativ.zone/features/changelog` |
| S6 | ESP's own web uploader supports applying metadata from a **CSV after** the files are uploaded ("Templates" → "Apply from CSV"), and the CSV columns are `file name, created date, title, description, country, brief code, keywords` (keywords comma-separated inside quotes). DeepMeta can apply the same CSV when it is added **together with** the files. | DeepMeta 3 import docs + `files.deepmeta.net/public/MetadataExampleCreativeImage.csv`; photokeyworder.ai blog (2025) for the web-uploader CSV step |
| S7 | Getty **publicly restricted** a third-party automation tool: in July 2018 iStock/Getty told contributors that imagery submitted via StockSubmitter would no longer be supported (citing keyword quality) and named the accepted routes: *"ESP upload tool … or one of the third‑party direct upload tools that are available: DeepMeta or QHero."* | microstockgroup thread quoting the Getty/iStock notice |
| S8 | In 2022 StockSubmitter's ESP keyword lookup broke and was only restored via a **browser extension** shipped by the vendor — i.e. the industry workaround for ESP automation is *driving the real browser*, exactly what this design does. | microstockgroup, "Uploading to iStock through stock submitter" |
| S9 | picWorkflow (a multi-agency uploader) states iStock's policy is to **not grant contributor API access to tools servicing multiple agencies**, and recommends DeepMeta for iStock. | `picworkflow.com/contact/?search=istock` |
| S10 | Getty Images' general **Terms of Use** prohibit "using any data mining, robots or similar data gathering or extraction methods"; the Web Services Addendum likewise bars robots/spiders "with respect to the Web Services". These clauses are written about *content gathering*, not about a contributor operating their own submission UI, but they establish that Getty polices automation. | `gettyimages.com/terms-of-use`, `gettyimages.com/gi-resources/Files/Legal/WebServicesAddendum.usa.pdf` |
| S11 | Getty does **not** accept generative-AI content from contributors (2026 guidance). IconSplitter can generate SVG artwork with AI models, so some exports may be ineligible regardless of how they are uploaded. Requires Getty confirmation, but must be surfaced to the user. | `rastock.ai/blog/getty-images-contributor-requirements` (third party, 2026) |
| S12 | The ESP upload page in contributor screenshots shows the strings **"Submission Batch: iStock Creative Image"**, **"Upload Files"**, **"Region"**, **"Click or drag and drop files here to upload directly from your …"** and a **"Saved successfully"** toast — i.e. batches are typed, there is a region field, and the dropzone also accepts a file-picker. | iStock contributor search-page snapshots of ESP (`istockphoto.com/photos/getty-contributor`) — weak, indirect evidence |
| S13 | Playwright's own guidance for authenticated automation is a **persistent profile or `storageState`**, with an explicit warning that the stored state contains cookies that can impersonate the account and must never be committed. | `playwright.dev/docs/auth` |
| S14 | Chrome DevTools Protocol exposes `DOM.setFileInputFiles` (set files on a file input by node/backend id), `Page.setInterceptFileChooserDialog`, and drag interception (`Input.setInterceptDrags` / `Input.dispatchDragEvent`) — the three ways to attach local files without an OS dialog. | `chromedevtools.github.io/devtools-protocol` (DOM, Page, Input domains) |

## 4. Consolidated picture

- **There is no contributor FTP for illustrations**, and the official API is
  partner-gated (V4). The web uploader is the only universal route.
- **The web uploader is a normal cookie-session web app** (V1, V2) with a typed
  batch, a dropzone/file input, server-side metadata extraction from the file
  bytes and an optional CSV apply (S1, S3, S6, S12).
- **Automating it is technically feasible** (CDP/Playwright attach files and
  read the DOM: S13, S14), and is what other tools have done when the sanctioned
  paths were blocked (S8).
- **Automating it is not sanctioned.** Getty names its accepted tools (S7),
  refuses contributor API access to multi-agency tools (S9), and polices
  automation in its terms (S10). DeepMeta works *because Getty cooperates with
  it* (S4). Therefore the feature must be conservative, opt-in, human-submitted
  and verifiable, and the project should ask Getty for approval rather than
  assume it.
- **ESP drifts.** DeepMeta's changelog (S5) is a year-by-year list of ESP DOM
  and API changes. Any automation must fail closed and be cheap to re-point.

## 5. Open questions & probe list

Each probe is done **by the user, on their own machine and account**, with the
network panel open; results go into a sanitized selector/endpoint pack. Nothing
here may be executed by an agent, and no HAR/cookie/session material may be
committed.

| ID | Unknown | Probe (manual, ~5 min) | Fail-closed behaviour meanwhile |
|---|---|---|---|
| Q1 | Does `/sign-in` still render a plain form, and does it accept a scripted submit? | sign in normally once; then sign out and sign in with the bridge's `--dry-run` typing path | if either fails → `needs-human`, ask the user to sign in |
| Q2 | Is a CAPTCHA, device check or email 2FA ever shown? | three fresh-profile sign-ins from the same machine | never solved by us; `needs-human` with a screenshot-free hint |
| Q3 | Session lifetime / cookie name / "remember me" | observe after 1 h, 1 day, 1 week | re-auth on redirect to `/sign-in` |
| Q4 | Exact content-type labels in the type dropdown (illustration vs photo, iStock vs Getty) | open "Upload & review content", list the dropdown options verbatim | match against a configured list; unmatched label → `needs-human`, never guess |
| Q5 | Is there an `input[type=file]` (visible or hidden), or only the dropzone? | inspect the upload page | discovery order: input → intercepted file chooser → drag event → `needs-human` |
| Q6 | Upload transport: direct multipart to ESP, or presigned storage URLs? | DevTools network while uploading one 1 MB file | irrelevant to the DOM driver; recorded because it decides whether an API-replay driver is ever worth building |
| Q7 | Does server-side extraction pick up our embedded XMP/IPTC for `.eps`? | upload one staged pair, read the batch row's title/keywords before any CSV | if empty → apply CSV (opt-in), and if still empty → mark `metadata-missing`, not `uploaded` |
| Q8 | Do drops of 50–100 files in one go work, and how long does processing take? | upload 10, then 50 | sequential per-file attach with pacing; processing wait has a bounded timeout |
| Q9 | Are duplicate filenames inside one batch rejected? | upload the same name twice in a scratch batch | preflight rejects duplicates locally |
| Q10 | Does the batch list expose an explicit per-file error/validation state? | look for error badges after uploading a deliberately invalid JPEG | verification requires "present + no error badge"; otherwise `unverified` |
| Q11 | What is the current per-file size ceiling? | upload a 49 MB and a 51 MB JPEG | preflight uses 50 MB and says it is a configured limit, not a Getty guarantee |
| Q12 | Is the `.eps` + `.jpg` pair created as one row or two? | upload one pair | verify by stem + both extensions; a single-row UI is recorded, not assumed |

## 6. Deliberate non-goals

- Solving CAPTCHAs, spoofing fingerprints/UA, rotating proxies, or hiding that a
  browser is automated. If ESP refuses an honest browser, the feature stops.
- Storing cookies/tokens outside the browser profile the user controls.
- Submitting for review, deleting remote files, editing existing ESP records,
  or handling releases.
- Multi-account or bulk-account operation; this is for the account owner's own
  exports only.
- Treating a saved ESP HTML page or a mock server as acceptance evidence
  (see the correction recorded in `docs/archive/2026-10-29-getty-esp-ingestion/README.md`).
