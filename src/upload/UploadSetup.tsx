// UploadSetup.tsx — the folder bar, the metadata prompt and the provider panel
// (prompt §1/§8/§18). Owns the three inputs whose values decide what a paid run
// sends and where the package lands, and the preflight verdict that says whether
// the run may start at all.
//
// The credential is written straight to IndexedDB (`svg/keystore`); it is never
// held in component state, never rendered in full and never written to a record.

import { useState } from "react";
import { formatStroke } from "../lib/uploadunits";
import { OpenFolderButton, FolderPathRow } from "../ui/FolderBar";
import { modelLabel } from "../lib/geminiconfig";
import { promptChars } from "../lib/uploadprompt";
import type { UploadApi } from "./useUpload";

export default function UploadSetup({ api }: { api: UploadApi }) {
  return (
    <section className="py-4" aria-label="Source folder and provider">
      <FolderBar api={api} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]" aria-label="Metadata generation configuration">
        <Prompt api={api} />
        <Provider api={api} />
      </div>
    </section>
  );
}

function FolderBar({ api }: { api: UploadApi }) {
  const counts = api.counts;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <OpenFolderButton testid="upload-open-folder" onClick={() => void api.chooseRoot()} />
        <button type="button" className="btn-ghost" data-testid="upload-rescan" disabled={api.busy || !api.supported}
          onClick={() => void api.rescan()}>
          Rescan approved
        </button>
        <span className="text-[10px] text-slate-400">Approved SVGs only · recursive · export/ excluded · {counts.eligible} rows</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {[["eligible", counts.eligible], ["metadata", counts.awaiting + counts.ready], ["exported", counts.processed], ["failed", counts.failed + counts.partial]].map(([label, value]) => (
            <span key={String(label)} className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300">
              <b className="mr-1 text-slate-100">{value}</b>{label}
            </span>
          ))}
        </div>
      </div>
      <FolderPathRow rootName={api.rootName} testid="upload-root-path" />
      <Preflight api={api} />
    </div>
  );
}

/** Blockers stop the run; warnings are things a person can decide to accept. */
function Preflight({ api }: { api: UploadApi }) {
  if (api.preflight.items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-[10px]" data-testid="upload-preflight">
      {api.preflight.items.map((item) => (
        <li key={item.id} className={item.level === "block" ? "text-rose-300" : "text-amber-300"}>
          {item.level === "block" ? "Blocked: " : "Note: "}{item.message}
        </li>
      ))}
    </ul>
  );
}

function Prompt({ api }: { api: UploadApi }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-300">
        <label htmlFor="upload-prompt">Metadata prompt <span className="normal-case text-slate-400">· saved on this device</span></label>
        <button type="button" className="btn-mini" data-testid="upload-reset-prompt" onClick={api.resetPrompt}>Reset default</button>
      </div>
      <textarea
        id="upload-prompt" data-testid="upload-prompt-box" spellCheck={false}
        className="h-56 w-full rounded-lg border border-white/10 bg-slate-950/60 p-3 font-mono text-[11px] leading-relaxed text-slate-100"
        value={api.prompt} onChange={(event) => api.setPrompt(event.target.value)}
      />
      <p className="mt-1 text-[10px] text-slate-400">
        {promptChars(api.prompt, api.provider.structured)} characters sent · 40 keywords, 5–7 + 3–5 title words, 7–15
        description words · restricted content is flagged, never cleared.
      </p>
    </div>
  );
}

function Provider({ api }: { api: UploadApi }) {
  const [key, setKey] = useState("");
  return (
    <aside className="rounded-2xl border border-white/10 bg-white/[0.04] p-4" aria-label="Metadata API">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-300">Gemini · metadata API</div>
      <div className="mb-3 text-[10px] text-slate-400">
        {Math.round(api.provider.timeoutMs / 1000)}s timeout · {api.provider.retries} retries · {api.provider.concurrency} concurrent
      </div>
      <ApiFields api={api} />
      <p className="my-2 text-[10px] text-slate-400">
        The rendered icon and the prompt above are sent together; the model id is the verified one and is never
        swapped silently.
      </p>
      <KeyRow api={api} value={key} onChange={setKey} />
      <p className="mt-1 text-[10px] text-slate-400">
        Stroke {formatStroke(api.settings.strokeWidth, api.settings.strokeUnit)} at {api.settings.dpi} DPI · JPEG{" "}
        {api.settings.targetMP} MP · {api.settings.optimizeSvg ? "SVGO on" : "SVGO off"} ·{" "}
        {api.settings.includeEps ? "EPS on" : "EPS off"}
      </p>
    </aside>
  );
}

const INPUT = "mt-1 w-full rounded border border-white/10 bg-slate-900 px-2 py-1 text-[10px] text-slate-100";

function ApiFields({ api }: { api: UploadApi }) {
  const provider = api.provider;
  return (
    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
      <label>Model
        <input readOnly value={modelLabel(provider.model)} data-testid="upload-model" className={INPUT} />
      </label>
      <label>Response
        <select className={INPUT} value={provider.structured ? "structured" : "text"} data-testid="upload-structured"
          onChange={(event) => api.updateProvider({ structured: event.target.value === "structured" })}>
          <option value="structured">Structured JSON</option>
          <option value="text">Labelled text</option>
        </select>
      </label>
      <NumberField label="Concurrency" min={1} max={4} step={1} value={provider.concurrency} testid="upload-concurrency"
        onChange={(value) => api.updateProvider({ concurrency: value })} />
      <NumberField label="Temperature" min={0} max={2} step={0.1} value={provider.temperature} testid="upload-temperature"
        onChange={(value) => api.updateProvider({ temperature: value })} />
    </div>
  );
}

function NumberField({ label, min, max, step, value, testid, onChange }: {
  label: string; min: number; max: number; step: number; value: number; testid: string; onChange: (value: number) => void;
}) {
  return (
    <label>{label}
      <input className={INPUT} type="number" min={min} max={max} step={step} value={value} data-testid={testid}
        onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

/** The credential goes straight to IndexedDB; it is never kept in state. */
function KeyRow({ api, value, onChange }: { api: UploadApi; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-end gap-2 border-t border-white/10 pt-2">
      <label className="min-w-0 flex-1 text-[10px] text-slate-400">API key · stored locally only
        <input
          className={`${INPUT} tracking-widest`} type="password" value={value} placeholder={api.keyMask ?? "not set"}
          data-testid="upload-key" onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <button type="button" className="btn-mini" data-testid="upload-save-key"
        onClick={() => void api.saveKey(value).then(() => onChange(""))}>
        Save key
      </button>
      <span className="text-[9px] text-emerald-300">{api.keyMask === null ? "not set" : api.keyMask}</span>
    </div>
  );
}
