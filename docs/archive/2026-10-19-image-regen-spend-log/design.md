# AI source regeneration — tokens and cost in the log (2026-10-19)

**Report (owner):** after an AI source regeneration, the global log did not say
how many tokens were spent or what the regeneration cost.

**Root cause:** `svg/imgrunner.ts` parsed the image from the `/images/edits`
response and threw away the rest of the response, including its `usage` block
and the `x-request-id` header. The run's log entries in `svg/imgactions.ts`
therefore had nothing to report.

Built on top of the remote fix `0f53248` (archive/2026-10-19-image-regen-fix:
`onResult` per item, `RegenTally` + `regenOutcome`, the record-on-landing run).
That fix already counts "done" correctly. This change only adds the spend.

## Change

| File | Responsibility |
|---|---|
| `lib/svgimgreg.ts` `readImageUsage` | Pure. Reads the response's `usage` into the shared `Usage` shape. Accepts the Images API names (`input_tokens`/`output_tokens`) and the chat names (`prompt_tokens`/`completion_tokens`), plus `total_tokens` and a router `cost`. A missing number stays `null`. |
| `svg/imgrunner.ts` | `fetchImage` returns the image together with `usage` and `requestId`, and `outcomeOf` spreads them into the `done` result. |
| `svg/imglog.ts` (new) | The log vocabulary, mirroring `svg/runlog.ts`. `imageItemSpec` is one `image-regen-item` entry per landed request. `imageRunSpec` is the `image-regen` summary: the `regenOutcome` text plus the summed spend. `imageSpendSuffix` is the toast tail. The cost decision reuses `costInfoFor` + `costLabel`, so a cost is shown as reported, as Estimated, or as "no cost reported". |
| `svg/imgactions.ts` | `ImgRun.results` collects every outcome. `land` logs the item spend for a done request. `entryFor` keeps the `requestId` (it was always `null` before). `finish` logs `imageRunSpec` and appends `imageSpendSuffix` to the toast. |

## Decisions

- **No image rate card.** GPT-Image pricing splits tokens into text, image input
  and image output, and that split is not in the response we keep. The cost
  therefore comes only from the router. Without a router cost the log says
  "no cost reported", never a guessed number (RULE 4, svgpricing header).
- **The log always carries the spend; the toast only when something was reported.**
  A toast tail of `— in · — out · — tokens · no cost reported` would only add
  noise. The log entry keeps the honest "nothing reported".
- **Failures keep the remote's `image-regen-failed` entry.** A failed request
  has no usage, so no second entry is written for it.
- Not exercised against the live Requesty API. Whether Requesty adds `cost` to
  `/images/edits` responses is not documented. If it does not, the log shows
  the tokens and says "no cost reported".
