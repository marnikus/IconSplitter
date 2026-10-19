# AI source regeneration — tokens and cost in the log (2026-10-19)

**Report (owner):** after an AI source regeneration, the global log said only
`N done, M failed`. It did not say how many tokens were spent or what the
regeneration cost.

**Root cause:** `svg/imgrunner.ts` parsed the image from the `/images/edits`
response and threw away the rest of the response, including its `usage` block
and the `x-request-id` header. The log line in `svg/imgactions.ts` therefore
had nothing to report.

## Change

| File | Responsibility |
|---|---|
| `lib/svgimgreg.ts` `readImageUsage` | Pure. Reads the response's `usage` into the shared `Usage` shape. Accepts the Images API names (`input_tokens`/`output_tokens`) and the chat names (`prompt_tokens`/`completion_tokens`), plus `total_tokens` and a router `cost`. A missing number stays `null`. |
| `svg/imgrunner.ts` | Each `done` result now carries `usage` and `requestId`. The image parse moved into `imageOf` so `attempt` stays within the size limit. |
| `svg/imglog.ts` (new) | The log vocabulary, mirroring `svg/runlog.ts`: one `image-regen-item` entry per source, one `image-regen` summary, and `imageSpendLine` for the toast. The cost decision reuses `costInfoFor` + `costLabel`, so a cost is shown as reported, as Estimated, or as "no cost reported". |
| `svg/imgactions.ts` | `confirmOf` delegates to `recordAll`. Every result is logged, the summary carries the summed spend, the toast appends it, and the history entry keeps `requestId` (it was always `null` before). |

## Decisions

- **No image rate card.** GPT-Image pricing splits tokens into text, image input
  and image output, and that split is not in the response we keep. The cost
  therefore comes only from the router. Without a router cost the log says
  "no cost reported", never a guessed number (RULE 4, svgpricing header).
- **"done" was miscounted.** A failed request still writes a failed history
  entry, so `meta !== null` used to count it as done. That made the toast claim
  a regeneration that did not happen. Now `done` means the request succeeded
  AND its image landed.
- Not exercised against the live Requesty API. Whether Requesty adds `cost` to
  `/images/edits` responses is not documented. If it does not, the log shows
  the tokens and says "no cost reported".
