# Core invariants

Stable IDs belong here; [all IDs](README.md) route to one canonical definition.

<a id="i-1"></a>
* **I-1 (RULE 6):** every export contains exactly the currently included boxes
  of currently loaded sheets.

<a id="i-2"></a>
* **I-2 (RULE 4):** "no icons detected" and "image could not be read" are
  distinct honest states — never a fake success.

<a id="i-3"></a>
* **I-3 (RULE 11):** exclusion never destroys detection work.

<a id="i-4"></a>
* **I-4 (RULE 15):** a blob is delivered only after canvas dims > 0, blob
  non-null, size > 0; otherwise the item is skipped with an error.

<a id="i-5"></a>
* **I-5 (RULE 20):** local image processing and exports remain in-browser;
  only the inputs disclosed in an explicitly confirmed provider run may leave
  for the named provider (including one previewed multi-icon image-edit
  composite). A dialog opening never sends; no analytics, keys, image bytes
  or full prompts enter the log or in-flight journal.

<a id="i-6"></a>
* **I-6 (RULE 22):** export names derive from one function: sanitized sheet
  base + `-icon-NN.png`, deterministic detection order.

<a id="i-7"></a>
* **I-7 (RULE 24):** every visible value mirrors current state at the moment
  of change — no value waits for another interaction to become visible.
