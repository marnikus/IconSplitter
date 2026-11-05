# SVG generation through the ChatGPT web page (2026-11-03)

Owner page for the **"Generate with web page"** mode of the Generate SVG tab.
Return to the [router](../README.md) or the [Generate SVG owner](svg-generation.md).

## What it does

The user's ChatGPT conversation answers instead of the provider API. The local
helper drives a real Chrome/Edge window with its own profile. For each request
it opens the chat URL, waits for a usable composer (the user signs in there
once), attaches ONE reference image, types the prompt (plus the current SVG
code when regenerating), sends, waits until a NEW reply stops changing with no
stop button, and returns the reply text. The app extracts the SVG and saves it
as the next version like an API answer.

## Module boundaries

| Layer | Owns | Must not |
|---|---|---|
| `tools/bridge/webdriver/` (`browser`, `cdp`, `cookies`) | launching/attaching Chrome, CDP, cookie snapshot | know any feature: env names, temp prefix and hints come from the caller's `naming` |
| `gettyweb/browser.mjs`, `aichat/browser.mjs` | each feature's `naming` (`GETTY_WEB_*` / `AICHAT_*`) and profile | read the other feature's variables |
| `aichat/chatflow.mjs` | one turn against an abstract page (ready, attach, type, send, wait, restart, file follow-up) | touch CDP, HTTP or files |
| `aichat/chatpage.mjs` | in-page DOM steps + their CDP binding | decide the flow |
| `aichat/pool.mjs` | the one kept page, one turn at a time, temp PNG, latest progress | launch browsers or speak HTTP |
| `aichat/routes.mjs` | HTTP validation, status codes, cancel on connection close | hold page logic |
| `src/lib/webchatclient.ts` | the `/aichat/*` wire | know runs or icons |
| `src/svg/runweb.ts` `createWebTransport` | the run's chat URL, the tab-wide one-turn-at-a-time line, failure mapping | mutate run arguments |
| `src/svg/answerer.ts` | request size, reply matching, recorded provider/model | — it is the only place that tells API from web |
| `runsend.ts` | dispatch to `args.web.send` or the API ladder | interpret web replies |

## Contract

| Rule | Where |
|---|---|
| The bulk-bar checkbox picks the confirmation; both Generate and Regenerate use it | `WebModeToggle.tsx`, `SvgDialogs.tsx` |
| The LIVE WEB popup is `SvgConfirm` with `web`: same prompt picker, sheet pager and full prompt; plus chat URL and two waits; confirm disabled until the URL is `https://chatgpt.com/…` | `SvgConfirm.tsx`, `SvgConfirmWeb.tsx` |
| One icon per request whatever "Images / request" says | `answerer.ts` `requestSizeOf`, `runqueuepath.ts`, `SvgConfirm.tsx` |
| No API key for a web batch: `guard(…, needsKey)` (caller passes it) and `confirmationProblem(…, web)` | `actions.ts`, `runplan.ts`, `runcontrol.ts` |
| The confirmed target is frozen into `QueueItem.web`; the transport is created at launch | `runqueue.ts`, `runjobs.ts` `webTransportOf` |
| Web turns of all parallel runs go through the helper one at a time; a turn cancelled while waiting is never sent; never retried | `runweb.ts` |
| A bare untitled reply belongs to the request's only icon; a batch is never guessed | `lib/svgextract.ts` `matchLoneBlock` |
| `<use href="#id">` copies are expanded before saving (both transports) | `lib/svguse.ts`, `runbatch.ts` |
| Versions record provider `Web: <host>` and model `ChatGPT (web)` (never the API model), unknown tokens, no cost; the journal names the same model | `answerer.ts`, `runbatch.ts`, `runsend.ts` |
| No finished reply within the max wait → new chat once, resend; a new `/c/<id>` URL moves the transport and replaces the saved URL | `chatflow.mjs`, `runweb.ts`, `runjobs.ts` |
| A file-card reply gets one follow-up asking for inline code, else `reply_was_file` | `chatflow.mjs` |
| Paced like a person: a pause before the attach, the paste and the Send click (also in a follow-up and a restarted chat), each varied 75–125 %; a Cancel ends it at once. Popup setting "Pause between steps" (`svg-web-step`, stored `stepDelaySec`, default 1 s, 0–10 s) → `stepDelayMs` | `chatflow.mjs` `jitteredDelay`, `SvgConfirmWeb.tsx`, `lib/webchatprefs.ts` |
| Skip / cancel aborts the fetch; the helper cancels the named turn (a nameless cancel does nothing) and on connection close | `webchatclient.ts`, `routes.mjs`, `pool.mjs` |

## Helper routes

`POST /aichat/send` `{ url, prompt, image: PNG data URL or null (text-only: no attach, no attachment limit), maxWaitMs (1–60 min),
readyTimeoutMs (10 s–30 min), stepDelayMs (0–10 s, default 1 s), sessionKey }` → `{ ok, text, chatUrl, restarted }`
or `{ ok:false, code, reason }`. `GET /aichat/progress?sessionKey=` →
`{ ok, busy, progress }` (latest turn only; phases `opening`,
`waiting-for-login`, `uploading`, `typing`, `generating`, `restarting-chat`,
`scraping`, `done`, `failed`). `POST /aichat/cancel` `{ sessionKey }`.
`POST /aichat/close`. Status: 400, 401 not signed in, 409 busy, 422 file reply,
429 ChatGPT limit, 499 cancelled, 503 browser, 504 timeout, 502 page. `/health` →
`aichat: { ready, browser, headed, profile }`; a running turn blocks self-restart.

Flags/env: `--aichat-profile` (`AICHAT_PROFILE`, default
`~/.iconsplitter/chatgpt-profile`), `--aichat-headless` (`AICHAT_HEADLESS=1`;
visible by default), `--aichat-cdp` (`AICHAT_CDP`), `AICHAT_BROWSER`.

## Page handles (data-*/aria only — class names are build hashes)

Composer `form[data-composer-placement="thread"] [contenteditable][role=textbox]`;
attachments `[data-composer-attachments]`; image input
`input[type=file][accept*=image]:not([capture])`; send
`button[data-testid=send-button]` / `aria-label^=Send`; stop
`button[data-testid=stop-button]` / `aria-label^=Stop`; file card
`[data-file-reference]`; new chat `button[aria-label="New chat"]`.
Reply, **anchored on the prompt**: each request sends its prompt's own line
`Icon name (use it as the SVG <title>): <name>` (`iconNameLine`, the same
function that writes it into the prompt) as `anchor`. The helper waits until a
prompt carrying that line appears (phase `sent`; never appearing = `page`
error), then takes the first answer body BELOW the last such prompt and above
the next prompt — never just the newest answer — and saves it only once it is
finished (no stop button, text stable, `</svg>` present). Reply text, in order: a code
block's `[data-markdown-copy-text]` (a block shown as a preview picture has no
visible code), else its preview `img[src^="data:image/svg+xml"]` decoded, else
the answer's visible text. Answer bodies are
`[data-markdown-text-style=assistant-message]` (every layout seen; the
2026-11-05 layout has no `[data-turn-key]`), fallback
`[data-message-author-role=assistant]`; prompts are `[data-user-message-bubble]`
(fallbacks: author-role/markdown user markup). Without an anchor: the newest
answer. While a request runs, an activity bar shows
"ChatGPT web · <icon> — <step>…" and closes when the reply is in.
Limit notice ("out of attachments… try again after…"): matching text OUTSIDE
any message, checked before the attach and when the image never appears →
`limit` (429) with ChatGPT's words; never retried, no new chat.
Send, stop and attachment handles are not yet confirmed on a live page. When
ChatGPT changes, update `aichat/chatpage.mjs` and `tests/aichat_page.test.ts`
(fixtures built from the user's DOM dumps).

## Privacy

Only an explicit LIVE WEB confirmation sends anything, and only to 127.0.0.1.
The PNG is staged in a private temp folder and deleted after the attach. The
helper log names method, status and bytes — never prompt, image, URL or reply.

## Tests

Helper: `aichat_flow`, `aichat_page`, `aichat_pool`, `bridge_aichat`,
`webdriver_browser`. App: `webchat_lib`, `svg_web_extract`, `svg_web_transport`,
`svg_runner_web`, `svg_web_queue`, `svg_confirm_web`. No live chatgpt.com call.
