// UploadMetadata.tsx — the metadata strip under one row (design §10). The
// request is specific about this control and about the promises it makes:
//   · it is EMPTY until a metadata run produced something (never prefilled with
//     a guess, never with another icon's text);
//   · it is EDITABLE and COPYABLE — every field, plus one button that copies
//     title, description and the tags as a comma-separated line;
//   · what it holds DRIVES the SVG and the JPEG preview, because the export
//     embeds exactly these values and the row shows the state that follows from
//     them (accepted / needs review / stale);
//   · the policy is stated where the user can see it: the tag count against the
//     required total, the word counts, and the warnings the policy raised.
// Editing is local until Save; Save re-validates with the same rules, so an
// invalid edit can only ever be stored as a draft that cannot be exported.

import { useEffect, useState } from "react";
import { TAG_COUNT, TITLE_WORDS, HOOK_WORDS, DESC_WORDS, REQUIRED_TAGS, words } from "../lib/svgupload/metaprompt";
import type { MetaRecord } from "../lib/svgupload/metaprompt";
import { editVerdict, META_STATE_TEXT, type MetaState } from "../lib/svgupload/meta";
import { validateTags } from "../lib/svgupload/metapolicy";
import { splitTags, tagsText } from "../lib/svgupload/metaprompt";

/** The rule each field is judged by, in the words the template uses. */
const FIELD_RULE = {
  title: `${TITLE_WORDS.min}–${TITLE_WORDS.max} words + ${HOOK_WORDS.min}–${HOOK_WORDS.max} word subtitle`,
  description: `${DESC_WORDS.min}–${DESC_WORDS.max} words`,
  tags: `exactly ${TAG_COUNT}, comma-separated · required: ${REQUIRED_TAGS.join(", ")}`,
} as const;

export type FieldName = keyof typeof FIELD_RULE;

/** "40/40 keywords ✓" — the tick is the policy's, never a bare count. */
export function keywordsLine(text: string): { text: string; ok: boolean } {
  const tags = splitTags(text);
  const ok = tags.length === TAG_COUNT && validateTags(tags).length === 0;
  return { text: `${tags.length}/${TAG_COUNT} keywords${ok ? " ✓" : ""}`, ok };
}

export interface UploadMetadataProps {
  id: string;
  state: MetaState;
  record: MetaRecord | null;
  /** True while this icon's metadata request is in flight. */
  busy: boolean;
  onGenerate: (id: string) => void;
  onSave: (id: string, patch: { title: string; description: string; tags: string[] }) => void;
  onCopy: (text: string) => void;
}

export default function UploadMetadata(p: UploadMetadataProps) {
  if (p.record === null) return <Empty p={p} />;
  return <Filled p={p} />;
}

/** No answer yet: the state word, the policy, and the one action that starts it. */
function Empty({ p }: { p: UploadMetadataProps }) {
  return (
    <div className="up-meta-block" data-testid={`up-meta-${p.id}`} data-meta-state={p.state}>
      <span className="up-meta-text">{META_STATE_TEXT[p.state]} — title, description and {TAG_COUNT} tags will appear here</span>
      <span className="up-policy" data-testid={`up-policy-${p.id}`}>
        {TAG_COUNT} tags required · includes {REQUIRED_TAGS.join(", ")} · title {TITLE_WORDS.min}–{TITLE_WORDS.max} + {HOOK_WORDS.min}–{HOOK_WORDS.max} words · description {DESC_WORDS.min}–{DESC_WORDS.max}
      </span>
      <button className="svg-btn" data-testid={`up-generate-${p.id}`} disabled={p.busy}
        onClick={(e) => { e.stopPropagation(); p.onGenerate(p.id); }}>
        {p.busy ? "Generating…" : "Generate metadata"}
      </button>
      {p.state === "stale" && <span className="up-note">the stored text was made from an earlier version of this icon</span>}
    </div>
  );
}

/** An answer (or a draft): the three editable fields, the verdict, the actions. */
function Filled({ p }: { p: UploadMetadataProps }) {
  const record = p.record as MetaRecord;
  const [draft, setDraft] = useState(() => draftOf(record));
  useEffect(() => setDraft(draftOf(record)), [record]);
  const verdict = editVerdict(record);
  return (
    <div className="up-meta-block" data-testid={`up-meta-${p.id}`} data-meta-state={p.state}>
      <Field id={p.id} name="title" label="Title" value={draft.title} busy={p.busy}
        words={words(draft.title).length} onCopy={p.onCopy} onChange={(v) => setDraft({ ...draft, title: v })} />
      <Field id={p.id} name="description" label="Description" value={draft.description} busy={p.busy}
        words={words(draft.description).length} onCopy={p.onCopy} onChange={(v) => setDraft({ ...draft, description: v })} />
      <Field id={p.id} name="tags" label="Keywords" value={draft.tags} busy={p.busy} words={null}
        onCopy={p.onCopy} onChange={(v) => setDraft({ ...draft, tags: v })} />
      <Verdict id={p.id} verdict={verdict} dirty={isDirty(record, draft)} />
      <RowActions p={p} draft={draft} record={record} />
    </div>
  );
}

function draftOf(record: MetaRecord): { title: string; description: string; tags: string } {
  return { title: record.title, description: record.description, tags: tagsText(record.tags) };
}

function isDirty(record: MetaRecord, draft: { title: string; description: string; tags: string }): boolean {
  return draft.title !== record.title || draft.description !== record.description || draft.tags !== tagsText(record.tags);
}

/** One editable field: its head (rule, counter, its own Copy) and the input. */
function Field({ id, name, label, value, words: n, busy, onCopy, onChange }: {
  id: string; name: FieldName; label: string; value: string; words: number | null;
  busy: boolean; onCopy: (text: string) => void; onChange: (value: string) => void;
}) {
  return (
    <label className="up-field">
      <span className="up-field-label" data-testid={`up-head-${name}-${id}`}>
        {label}
        <em className="up-count">{FIELD_RULE[name]}</em>
        {n !== null && <em className="up-count">{n} words</em>}
        {name === "tags" && <Keywords id={id} text={value} />}
        <button className="svg-btn ghost up-mini" data-testid={`up-copy-${name}-${id}`} title={`Copy the ${label.toLowerCase()}`}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onCopy(value); }}>Copy</button>
      </span>
      <input className="svg-input up-input" data-testid={`up-${name}-${id}`} value={value} disabled={busy}
        placeholder={name === "tags" ? "comma separated keywords" : ""}
        onChange={(e) => onChange(e.target.value)} onClick={(e) => e.stopPropagation()} />
    </label>
  );
}

/** The keyword count the template asks for, from the same policy the export uses. */
function Keywords({ id, text }: { id: string; text: string }) {
  const line = keywordsLine(text);
  return <em className={`up-count${line.ok ? " ok" : ""}`} data-testid={`up-keywords-${id}`}>{line.text}</em>;
}

/** The policy's own words: what is wrong (errors) or merely worth knowing. */
function Verdict({ id, verdict, dirty }: { id: string; verdict: { ok: boolean; lines: string[] }; dirty: boolean }) {
  if (verdict.lines.length === 0) {
    return <span className="up-verdict ok" data-testid={`up-verdict-${id}`}>checked against the rules{dirty ? " (unsaved edit)" : ""}</span>;
  }
  return (
    <span className={`up-verdict${verdict.ok ? "" : " bad"}`} data-testid={`up-verdict-${id}`}>
      {verdict.lines.join(" ")}
    </span>
  );
}

/** Save (re-validated), copy (all three fields) and a fresh run. */
function RowActions({ p, draft, record }: { p: UploadMetadataProps; draft: { title: string; description: string; tags: string }; record: MetaRecord }) {
  const dirty = isDirty(record, draft);
  return (
    <span className="up-meta-actions">
      <button className="svg-btn" data-testid={`up-save-${p.id}`} disabled={p.busy || !dirty}
        onClick={(e) => { e.stopPropagation(); p.onSave(p.id, { title: draft.title, description: draft.description, tags: splitTags(draft.tags) }); }}>Save</button>
      <button className="svg-btn ghost" data-testid={`up-copy-${p.id}`} title="Copy title, description and keywords as three lines"
        onClick={(e) => { e.stopPropagation(); p.onCopy(copyText(draft)); }}>Copy all fields</button>
      <button className="svg-btn ghost" data-testid={`up-regenerate-${p.id}`} disabled={p.busy}
        onClick={(e) => { e.stopPropagation(); p.onGenerate(p.id); }}>Regenerate</button>
    </span>
  );
}

/** The exact text the Copy button puts on the clipboard. */
export function copyText(draft: { title: string; description: string; tags: string }): string {
  return [draft.title, draft.description, draft.tags].filter((line) => line !== "").join("\n");
}
