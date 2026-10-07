// UploadList.tsx — the search/sort header and the row list (prompt §2/§3).
// Owns: turning the row model into the mockup's list, and the row itself —
// thumbnail, file and version, metadata state, export state, settings summary,
// the actions, and the editable metadata block.
//
// The row shows what the record says; it never recomputes a status of its own.
// Editing a field changes the DRAFT; exporting is what makes it accepted, which
// is why the badge under the block says so.

import { useEffect, useState } from "react";
import { countWords, splitTitle, TAG_COUNT, type MetadataRecord } from "../lib/uploadmeta";
import { STATUS_LABEL, outputsLabel, statusOf, statusTone, type SortKey, type UploadRow, type UploadStatus } from "./rows";
import { settingsSummary } from "../lib/uploadsettings";
import { useRootPath } from "../ui/FolderBar";
import SvgPreviewBox from "../svg/SvgPreview";
import type { UploadApi } from "./useUpload";

export default function UploadList({ api }: { api: UploadApi }) {
  return (
    <section id="upload-approved" aria-labelledby="upload-heading">
      <div className="table-title">
        <h1 id="upload-heading">APPROVED SVGs / METADATA &amp; EXPORT</h1>
        <span className="pill">{api.rows.length}</span>
        <span className="muted">one row per approved SVG</span>
        <div className="right">
          <span className="muted">{api.counts.processing} processing</span>
          <span className="pill amber">{api.counts.stale} stale</span>
        </div>
      </div>
      <Filters api={api} />
      <div className="column-head" aria-hidden="true">
        <span>Approved SVG</span><span>File / approved version / path</span><span>Metadata</span>
        <span>Export state</span><span>Settings</span><span>Preview / settings</span><span>Actions</span>
      </div>
      {api.shown.length === 0
        ? <p className="muted px-2 py-6 text-sm" data-testid="upload-empty">No approved SVG matches this view.</p>
        : api.shown.map((row) => <Row key={row.id} api={api} row={row} />)}
    </section>
  );
}

function Filters({ api }: { api: UploadApi }) {
  return (
    <section className="flex flex-wrap items-end gap-3 py-3" aria-label="Search, filter and sort">
      <div className="flex flex-col gap-1">
        <label htmlFor="upload-search" className="text-[9px] tracking-widest text-slate-400">SEARCH</label>
        <input id="upload-search" data-testid="upload-search" className={FIELD} value={api.list.query}
          onChange={(event) => api.setList({ query: event.target.value })} />
      </div>
      <Select api={api} id="upload-status" label="STATUS" value={api.list.status} onChange={(value) => api.setList({ status: value as UploadStatus | "all" })}>
        <option value="all">All statuses</option>
        {(Object.keys(STATUS_LABEL) as UploadStatus[]).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
      </Select>
      <Select api={api} id="upload-sort" label="SORT BY" value={api.list.sort} onChange={(value) => api.setList({ sort: value as SortKey })}>
        <option value="name">Name</option>
        <option value="status">Status</option>
        <option value="path">Path</option>
      </Select>
      <span className="ml-auto pb-1 text-[10px] text-slate-400">Showing <b>{api.shown.length}</b> of {api.rows.length}</span>
      <button type="button" className="btn-ghost" data-testid="upload-clear-filters"
        onClick={() => api.setList({ query: "", status: "all", sort: "name" })}>Clear filters</button>
    </section>
  );
}

/** One labelled select: three filters, one shape, one test id each. */
function Select({ api, id, label, value, onChange, children }: {
  api: UploadApi; id: string; label: string; value: string; onChange: (value: string) => void; children: React.ReactNode;
}) {
  void api;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[9px] tracking-widest text-slate-400">{label}</label>
      <select id={id} data-testid={id} className={FIELD} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  );
}

const FIELD = "rounded border border-white/10 bg-slate-900 px-2 py-1 text-[10px] text-slate-100";

const GRID = "grid grid-cols-[190px_minmax(0,1fr)_84px_92px_112px_118px_132px] items-center gap-3";

function Row({ api, row }: { api: UploadApi; row: UploadRow }) {
  const active = api.active?.id === row.id;
  const checked = api.checked.some((each) => each.id === row.id);
  return (
    <article
      className={`border-b border-white/10 pb-3${active ? " -mx-2 rounded bg-indigo-500/10 px-2 pt-2" : ""}`}
      data-testid={`upload-row-${row.id}`} aria-label={row.name} onClick={() => api.setActive(row.id)}
    >
      <div className={`${GRID} min-h-[132px] py-3`}>
        <Art api={api} row={row} checked={checked} />
        <FileCell api={api} row={row} />
        <States row={row} />
        <Settings api={api} row={row} />
        <RowButtons api={api} row={row} />
      </div>
      <MetadataBlock api={api} row={row} />
    </article>
  );
}

function Art({ api, row, checked }: { api: UploadApi; row: UploadRow; checked: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="checkbox" checked={checked} aria-label={`Select ${row.name}`} data-testid={`upload-check-${row.id}`}
        onChange={(event) => api.toggleCheck(row.id, event.target.checked)}
      />
      <Thumb row={row} background={api.previewBackground} size={api.zoom} />
    </div>
  );
}

function FileCell({ api, row }: { api: UploadApi; row: UploadRow }) {
  const path = useRootPath(api.rootName);
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold text-slate-100">{row.name}</div>
      <div className="break-words text-[9px] leading-relaxed text-slate-400">{row.svgPath ?? "no approved SVG yet"}</div>
      <div className="mt-1 text-[9px] text-slate-500">
        {path.path === "" ? row.dirPath : `${path.path}\\${row.dirPath}`} · version {row.version ?? "—"} ·{" "}
        {row.record === null ? "not exported yet" : outputsLabel(row.record.outputs)}
      </div>
      {row.problems.map((line) => <div key={line} className="text-[10px] text-rose-300">{line}</div>)}
    </div>
  );
}

function States({ row }: { row: UploadRow }) {
  const status = statusOf(row);
  return (
    <>
      <span className={`text-[11px] ${statusTone(status)}`} data-testid={`upload-status-${row.id}`}>{STATUS_LABEL[status]}</span>
      <span className={`text-[11px] ${row.record?.validation.ok === true ? "text-emerald-300" : "text-slate-400"}`}>
        {row.record === null ? "Not exported" : row.record.validation.ok ? "✓ Committed" : "Review"}
      </span>
    </>
  );
}

function Settings({ api, row }: { api: UploadApi; row: UploadRow }) {
  const overrides = api.overrides[row.id];
  const effective = { ...api.settings, ...(overrides ?? {}) };
  return (
    <div className="text-[10px] leading-relaxed text-slate-300">
      {settingsSummary(effective)}
      <small className="block text-[9px] text-slate-500">{overrides === undefined ? "defaults" : `${Object.keys(overrides).length} override(s)`}</small>
      <div className="text-[9px] text-slate-500">{row.progress ?? ""}</div>
    </div>
  );
}

function RowButtons({ api, row }: { api: UploadApi; row: UploadRow }) {
  const off = api.busy || row.svgPath === null;
  return (
    <>
      <div className="grid gap-1">
        <button type="button" className="btn-mini" disabled={row.svgPath === null} data-testid={`upload-preview-${row.id}`}
          onClick={() => void api.openPreview(row)}>Preview</button>
        <button type="button" className="btn-mini" data-testid={`upload-clear-override-${row.id}`}
          onClick={() => api.clearOverrideFor(row.id)}>Use defaults</button>
        <button type="button" className="btn-mini" data-testid={`upload-open-export-${row.id}`}
          onClick={() => void api.openExport(row)}>Open export</button>
      </div>
      <div className="grid gap-1">
        <button type="button" className="btn-mini bg-indigo-500/80" disabled={off} data-testid={`upload-gen-${row.id}`}
          onClick={() => void api.generate([row.id])}>Metadata</button>
        <button type="button" className="btn-mini bg-emerald-600/70" disabled={off} data-testid={`upload-export-${row.id}`}
          onClick={() => void api.exportRows([row.id])}>Export</button>
        <button type="button" className="btn-mini bg-rose-700/60" disabled={off} data-testid={`upload-retry-${row.id}`}
          onClick={() => void api.exportRows([row.id])}>Retry</button>
      </div>
    </>
  );
}

function Thumb({ row, background, size }: { row: UploadRow; background: string; size: number }) {
  const box = Math.min(Math.max(size, 48), 220);
  return (
    <span className="block overflow-hidden rounded border border-white/20" style={{ background }} data-testid={`upload-thumb-${row.id}`}>
      <SvgPreviewBox
        code={row.code} box={{ width: box, height: box }} testid={`upload-svg-${row.id}`}
        label={`${row.name} approved SVG`} version={row.version === null ? 0 : Number(row.version.replace(/\D/g, "")) || 0}
      />
    </span>
  );
}

/** The editable metadata: what is accepted, and the way to correct it. */
function MetadataBlock({ api, row }: { api: UploadApi; row: UploadRow }) {
  const [draft, setDraft] = useState<MetadataRecord>(row.metadata ?? { title: "", description: "", tags: [] });
  useEffect(() => { setDraft(row.metadata ?? { title: "", description: "", tags: [] }); }, [row.metadata, row.id]);
  const field = (patch: Partial<MetadataRecord>): void => setDraft({ ...draft, ...patch });
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/40 p-3" data-testid={`upload-meta-${row.id}`}>
      <MetaHead api={api} row={row} draft={draft} />
      <MetaFields row={row} draft={draft} field={field} />
      <MetaNotes row={row} />
    </div>
  );
}

function MetaHead({ api, row, draft }: { api: UploadApi; row: UploadRow; draft: MetadataRecord }) {
  const check = row.metadataCheck;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-300">
      <strong>Metadata · SVG &amp; JPEG</strong>
      <span className={`rounded-full border px-2 py-0.5 text-[9px] ${check?.ok === true ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-300"}`}
        data-testid={`upload-tags-${row.id}`}>
        {draft.tags.length}/{TAG_COUNT} keywords {check?.ok === true ? "✓" : ""}
      </span>
      <span className="text-[9px] text-slate-500">Edits are saved when you export</span>
      <button type="button" className="btn-mini ml-auto" data-testid={`upload-save-meta-${row.id}`}
        onClick={() => api.saveMetadata(row.id, draft)}>Save</button>
      <button type="button" className="btn-mini" data-testid={`upload-copy-meta-${row.id}`}
        onClick={() => void copy(metadataText(draft))}>Copy all fields</button>
    </div>
  );
}

function MetaFields({ row, draft, field }: { row: UploadRow; draft: MetadataRecord; field: (patch: Partial<MetadataRecord>) => void }) {
  return (
    <>
      <Field label={`Title · ${countWords(splitTitle(draft.title).main)} + ${countWords(splitTitle(draft.title).subtitle)} words`} id={`title-${row.id}`}>
        <input id={`title-${row.id}`} className={FIELD} data-testid={`upload-title-${row.id}`} value={draft.title}
          placeholder="Generate metadata to populate this field…" onChange={(event) => field({ title: event.target.value })} />
      </Field>
      <Field label={`Description · ${countWords(draft.description)} words`} id={`desc-${row.id}`}>
        <input id={`desc-${row.id}`} className={FIELD} data-testid={`upload-desc-${row.id}`} value={draft.description}
          placeholder="Generate metadata to populate this field…" onChange={(event) => field({ description: event.target.value })} />
      </Field>
      <Field label={`Keywords · exactly ${TAG_COUNT}, comma-separated`} id={`tags-${row.id}`}>
        <textarea id={`tags-${row.id}`} className={`${FIELD} h-16`} data-testid={`upload-tags-box-${row.id}`} value={draft.tags.join(", ")}
          onChange={(event) => field({ tags: event.target.value.split(/,|\n/).map((tag) => tag.trim()).filter((tag) => tag !== "") })} />
      </Field>
    </>
  );
}

function MetaNotes({ row }: { row: UploadRow }) {
  const check = row.metadataCheck;
  return (
    <>
      {(check?.errors ?? []).map((line) => <p key={line} className="text-[10px] text-rose-300">{line}</p>)}
      {(check?.warnings ?? []).map((line) => <p key={line} className="text-[10px] text-amber-300">{line}</p>)}
      {row.warnings.map((line) => <p key={line} className="text-[10px] text-amber-200">{line}</p>)}
    </>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between text-[9px] uppercase tracking-wide text-slate-400">
        <label htmlFor={id}>{label}</label>
      </div>
      {children}
    </div>
  );
}

async function copy(text: string): Promise<void> {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) return;
  await navigator.clipboard.writeText(text).catch(() => undefined);
}

function metadataText(record: MetadataRecord): string {
  return [`Title: ${record.title}`, `Description: ${record.description}`, `Tags: ${record.tags.join(", ")}`].join("\n");
}

export { metadataText };
