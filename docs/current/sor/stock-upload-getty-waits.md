# Getty web upload — what it waits for, said out loud (2026-11-12)

Parent: [Getty web upload](stock-upload-getty-web.md) · [selectors](../selectors/stock-upload-getty-web.md) ·
[helper](bridge-helper.md).

When Getty's page does not take the files the helper **waits and retries**: it
reloads the page, presses *Save metadata* again, re-uploads. The bar used to sit
silent through those waits. Now, **while the Getty upload runs**, the bar's note
line always says:

- **what it waits for and what comes next, with a counter that runs down**:
  `⏱ Waiting 0:23 — then: reload the Getty page and attach the missing files (1 of 2) · Getty has listed 3 of 10 file(s) and nothing new has appeared`;
  at 0 it reads `Now: …`;
- **what it is doing** once the timer is over (`↻ Reloading the Getty page
  (reload 1 of 2)…`, `Pressing Save metadata again (1 of 2)…`, `Re-uploading 3
  file(s) from the staged copy…`);
- a **↻ Retry now** button beside Cancel for a retry timer: it cuts the wait
  short and the helper takes its next step at once. A **deadline** (the last wait
  before the run gives up, or the wait for re-uploaded files) shows its counter
  but has no button — skipping it would only give up sooner.

## The waits (helper `tools/bridge/gettyweb/waits.mjs`, announced in `contribute.mjs`)

| `kind` | Waiting because | Next | Skip |
|---|---|---|---|
| `files` | the page listed fewer files than attached and nothing new for `STALL_MS` (30 s) | reload the page and attach the missing files (attempt n of 2) | yes; no after the 2nd reload |
| `pictures` | cards listed without their picture, nothing new for 30 s | reload so Getty draws them (n of 2) | yes |
| `pictures-bound` | no reload left; waiting out the picture bound | report the files that never got one | no |
| `ready` | cards not "Ready to submit" yet; the 30 s ladder (`readyPlan`) | press Save metadata again / reload and save again / re-upload from the staged copy (step n of N) | yes |
| `ready-bound` | the ladder is spent; waiting out the gate | report the files that never turned ready | no |
| `reupload` | re-attached files must come back on the page | report them as failed if they do not | no |

`createWaitControl()` is shared by every loop of a session: `begin(info)` (the
time left is worked out when it is **read**, never stored), `act(text)` (the wait
is over, the run does something), `end()`, `skip()` / `takeSkip()`. A loop that
sees the skip treats its window as passed. Only counts and our own wording are in
a wait — no file name, no page text.

## Route and reading

`GET /getty-web/progress` adds `wait {kind, reason, next, remainingMs, attempt,
of, skippable}` and `activity` (session `withWaitInfo`). **`POST
/getty-web/skip-wait` `{sessionKey}`** → `{ok, skipped}`; 404 when no upload runs
for that key. An older helper has neither: the bar then shows no wait line and no
button (never an error) — **restart the helper** to get it.

## App

`gettyprogress.ts` reads/validates the wait (`readWait`) and `gettyWebSkipWait`;
`runupload.ts` `waitStepOf` puts `wait` (+ `readAt`), `activity` and `skipWait`
into the panel step (`UploadProgressStep`); `GettyWaitInfo.tsx` draws the note
(`useRemaining` ticks every second by itself) and the button; the shared
`ProcessProgressBar` takes `note` (a node) and `runningExtra` (running only).

Handles: `stock-upload-wait`, `stock-upload-activity`, `stock-upload-wait-skip`.
Tests: `getty_web_waits` (control, reading), `getty_web_finalize` (ladder wait +
skip), `getty_web_batch` (stall countdown + skip), `bridge_getty_web` (route),
`getty_web_wait_info` (client, words, note, button, bar), `stockupload_getty_web`
(wait reaches the panel step).
