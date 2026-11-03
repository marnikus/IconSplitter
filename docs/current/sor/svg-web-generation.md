# SVG generation through the ChatGPT web page (2026-11-03)

Owner page for the **"Generate with web page"** mode of the Generate SVG tab.
Return to the [router](../README.md) or the [Generate SVG owner](svg-generation.md).

## What it does

The user's ChatGPT conversation answers instead of the provider API. The local
helper (`tools/bridge/server.mjs`) drives a real Chrome/Edge window with its
own profile. For each request it opens the chat URL, waits until the composer
is usable (the user signs in there the first time), attaches the ONE reference
image, types the prompt (with the current SVG code when regenerating), presses
send, waits until a NEW reply stops changing and no stop button shows, and
returns the reply text. The app extracts the SVG and saves it as the next
version exactly like an API answer.

## Contract

| Rule | Where |
|---|---|
| The bulk-bar checkbox `Generate with web page` picks which confirmation opens; both Generate and Regenerate use it | `src/svg/WebModeToggle.tsx`, `SvgDialogs.tsx` |
| The LIVE WEB popup is the API popup (`SvgConfirm`) with `web`: same prompt picker, sheet pager and full prompt; plus chat URL, max wait, sign-in wait; confirm disabled until the URL is `https://chatgpt.com/…` | `SvgConfirm.tsx`, `SvgConfirmWeb.tsx` |
| One icon per request, whatever "Images / request" says | `runner.ts`, `runqueuepath.ts`, `SvgConfirm.tsx` |
| No API key is needed for a web batch; the API path still requires one | `runplan.ts` `guard`, `runcontrol.ts` `confirmationProblem` |
| The confirmed chat target is frozen into the queued batch (`QueueItem.web`) | `runqueue.ts`, `runcontrol.ts` |
| Transport seam: `sendBatch` hands a web run to `sendWebRequest`; never retried automatically | `runsend.ts`, `runweb.ts` |
| A bare untitled reply belongs to the request's only icon (`matchLoneBlock`); a batch is never guessed | `lib/svgextract.ts` |
| `<use href="#id">` copies are expanded into real elements before saving (both transports) | `lib/svguse.ts`, `runbatch.ts` |
| The version records provider `Web: <host>`, unknown tokens, no cost | `runbatch.ts`, `lib/webchatprefs.ts` |
| No finished reply within the max wait → the helper opens a new chat once and resends; the new `/c/<id>` URL replaces the saved URL and the rest of the run uses it | `tools/bridge/aichat/chatflow.mjs`, `runweb.ts`, `runjobs.ts` `webRunOf` |
| A file-card reply gets one follow-up asking for inline code, else fails `reply_was_file` | `chatflow.mjs` |
| Skip / cancel aborts the fetch; the helper's turn is cancelled (`/aichat/cancel`, and on connection close) | `lib/webchatclient.ts`, `aichat/routes.mjs` |

## Helper routes

| Route | Body / answer |
|---|---|
| `POST /aichat/send` | `{ url, prompt, image: PNG data URL, maxWaitMs (1–60 min), readyTimeoutMs (10 s–30 min), sessionKey }` → `{ ok, text, chatUrl, restarted }` or `{ ok:false, code, reason }` |
| `GET /aichat/progress?sessionKey=` | `{ ok, busy, progress: { phase, at } | null }`; phases `opening`, `waiting-for-login`, `uploading`, `typing`, `generating`, `restarting-chat`, `scraping`, `done`, `failed` |
| `POST /aichat/cancel` | `{ sessionKey }` → `{ ok, cancelled }` |
| `POST /aichat/close` | lets go of the page |

Status codes: 400 bad request, 401 not signed in / composer never ready, 409
busy (one turn at a time), 422 `reply_was_file`, 499 cancelled, 503 browser,
504 timeout, 502 page. `/health` reports `aichat: { ready, browser, headed, profile }`;
a running turn blocks the helper's self-restart.

Flags/env: `--aichat-profile <dir>` (`AICHAT_PROFILE`, default
`~/.iconsplitter/chatgpt-profile`), `--aichat-headless` (`AICHAT_HEADLESS=1`;
the window is visible by default), `--aichat-cdp <loopback url>` (`AICHAT_CDP`).

## Page handles (ChatGPT DOM, data-*/aria only — class names are build hashes)

Composer `form[data-composer-placement="thread"] [contenteditable][role=textbox]`;
attachments `[data-composer-attachments]`; image input
`input[type=file][accept*=image]:not([capture])`; send
`button[data-testid=send-button]` / `aria-label^=Send`; stop
`button[data-testid=stop-button]` / `aria-label^=Stop`; turns `[data-turn-key]`
with `[data-conversation-role]` (fallback `[data-message-author-role]`); reply
text `[data-markdown-text-style=assistant-message]` `textContent`; file card
`[data-file-reference]`; new chat `button[aria-label="New chat"]`.
When ChatGPT changes its page, update `tools/bridge/aichat/chatpage.mjs` and
its fixture test `tests/aichat_page.test.ts`.

## Privacy

Only an explicit LIVE WEB confirmation sends anything. The image and prompt go
to 127.0.0.1 only; the helper stages the PNG in a private temp folder and
deletes it after the attach. The helper log names method, status and bytes —
never the prompt, image, chat URL or reply.

## Tests

`aichat_flow`, `aichat_page`, `aichat_session`, `bridge_aichat` (helper);
`webchat_lib`, `svg_web_extract`, `svg_runner_web`, `svg_web_queue`,
`svg_confirm_web` (app). No live chatgpt.com call is ever made.
