# Task prompts are detected, not switched (2026-10-20)

Supersedes the tab row in
`docs/archive/2026-10-20-regen-batch-and-task-prompts/design.md` §3.3 ("Single
vs batch are two tabs in the picker"). The storage shape, the six task ids, the
"default above the picker" message and the fallbacks there are unchanged.

## The problem the tabs created

The popup already knows how many icons it will send — the selection is the
confirmation's own input, and the size control decides the pages. The tab row
asked the user to state that fact a second time, and it invited a state the app
could not honour:

* a user could switch to `Batch` while confirming a single icon, change the
  value, and reasonably expect the send to change — but the send follows the
  selection, so the choice only edited a memory that was not in force;
* the same row sat above a list it did not filter: the select still showed one
  task's value, so "which tab am I on?" had to be read twice (tab state and
  `data-task`);
* the note "not used by this batch" existed only to explain a control that
  should not have offered that state at all.

The user asked for the opposite: *no* Single icon / Batch switch. Detect the
situation, and for each situation suggest (and save) its own prompt.

## The decision

**The task is derived from the count, exactly as `taskOf(work, count)` already
did; nothing else may choose it.** The picker takes `count` and renders one
task: the message above the list, the select, and the note that explains what
that prompt does for this batch.

* One icon selected → `…​.single`; two or more → `…​.batch`. The same rule the
  badge already spells out ("Generation batch now · Generate SVG · batch").
* Choosing a value writes only the detected task's entry, so a single icon and
  a batch never overwrite each other's default — the requirement from the
  original design survives without a switch.
* A remembered default is suggested on open: the message
  `Default prompt for this task — …` (or the named fallback/refusal) states what
  the popup will use, and the select is already on it.
* Handles removed: `svg-confirm-prompt-tabs`, `-single`, `-batch` and their
  `svg-img-prompt-*` twins. `data-task` on the `-box` wrapper remains the one
  machine-readable statement of which situation is in force.

## Consequences

* `ui/TaskPromptPicker.tsx` lost its `Tabs` component and the `view` / `onView`
  props; `SvgConfirm.tsx` and `SvgImgConfirm.tsx` lost their view state and the
  "not used by this batch" note. The two popups still share one picker, one
  store and one resolve rule.
* Tests that proved the two memories now mount one icon and then many, instead
  of clicking a tab: they assert the same separation and additionally that no
  tab handle exists any more.
* Nothing about storage, the queue, the frozen batch or the regeneration text
  changes.

## Verification

`npx tsc --noEmit`; `tests/svg_confirm_task_prompt.test.tsx`,
`tests/svg_img_confirm_task_prompt.test.tsx` (both rewritten for detection),
`tests/prompttasks.test.ts`, `tests/svg_taskprompt.test.ts`, the confirmation
suites and the full `vitest` run; `node tools/quality.mjs --files …`.
