// upjournal.ts — the durable attempt journal and its restart rules (report
// §5/R10). Owns: the per-icon stage log a run leaves behind, the ONE
// reconciliation rule — a journal still marked `running` becomes
// `interrupted` exactly once and is never auto-resumed — and the accepted
// metadata draft, so a paid answer survives a crash (or a cancelled run)
// WITHOUT a second request. Pure and tolerant (RULE 13): nothing here touches
// the FS, the network or the DOM, and a journal never carries a key, image
// bytes or a request payload — only identity, stage outcomes and the draft.

import { validateMetadata, type IconMetadata } from "./upmeta";
import type { MetadataProvenance } from "./upexport";

export const JOURNAL_VERSION = 1;

/** The stage chain of the export job, in order (job.ts's state machine). */
export const JOURNAL_STAGES = ["preflight", "prepare", "metadata", "render", "embed", "eps", "validate", "commit"] as const;
export type JournalStage = (typeof JOURNAL_STAGES)[number];

export type AttemptOutcome = "started" | "done" | "failed" | "cancelled";
export interface Attempt {
  stage: JournalStage;
  outcome: AttemptOutcome;
  /** A user-facing reason — by construction never a key or a payload. */
  detail: string | null;
  at: string;
}

/** The run states a journal can be in; `running` is the only unfinished one. */
export type JournalState = "running" | "interrupted" | "processed" | "partial" | "failed" | "cancelled";

/**
 * The accepted metadata PLUS its provenance, so a recovered run reports the
 * true origin (model, request id, tokens, estimated cost) instead of claiming
 * a human typed an answer the model produced (report §5, pre-generation
 * provenance).
 */
export interface JournalDraft {
  meta: IconMetadata;
  provenance: MetadataProvenance;
}

export interface JobJournal {
  v: typeof JOURNAL_VERSION;
  pairId: string;
  source: { relPath: string; version: number };
  state: JournalState;
  attempts: Attempt[];
  /** The accepted metadata — recovery reuses it instead of paying again. */
  draft: JournalDraft | null;
  updatedAt: string;
}

/** How many attempts are kept; the tail is what matters, the head is history. */
const MAX_ATTEMPTS = 32;

export function newJournal(pairId: string, source: JobJournal["source"], at: string): JobJournal {
  return { v: JOURNAL_VERSION, pairId, source, state: "running", attempts: [], draft: null, updatedAt: at };
}

/**
 * A fresh run for the same icon keeps the draft (the paid answer already
 * exists) and starts a clean attempt list; a journal for another pair or
 * another source version never leaks its draft into this run.
 */
export function startRun(previous: JobJournal | null, pairId: string, source: JobJournal["source"], at: string): JobJournal {
  const fresh = newJournal(pairId, source, at);
  const same = previous !== null && previous.pairId === pairId
    && previous.source.relPath === source.relPath && previous.source.version === source.version;
  return same ? { ...fresh, draft: previous.draft } : fresh;
}

export type AttemptInput = Omit<Attempt, "outcome"> & { outcome: AttemptOutcome };

/** Appends one attempt (trimmed to the tail) and stamps the journal. */
export function withAttempt(j: JobJournal, attempt: AttemptInput): JobJournal {
  const attempts = [...j.attempts, attempt].slice(-MAX_ATTEMPTS);
  return { ...j, attempts, updatedAt: attempt.at };
}

export function withDraft(j: JobJournal, meta: IconMetadata, provenance: MetadataProvenance, at: string): JobJournal {
  return { ...j, draft: { meta, provenance }, updatedAt: at };
}

/** The terminal state a finished run reports (never `running`/`interrupted`). */
export type SettledState = "processed" | "partial" | "failed" | "cancelled";

export function settle(j: JobJournal, state: SettledState, at: string, detail: string | null = null): JobJournal {
  const outcome: AttemptOutcome = state === "processed" || state === "partial" ? "done" : state;
  const last = j.attempts[j.attempts.length - 1] ?? null;
  const withOutcome = last !== null && last.outcome === "started"
    ? { ...j, attempts: [...j.attempts.slice(0, -1), { ...last, outcome, detail: detail ?? last.detail }] }
    : j;
  return { ...withOutcome, state, updatedAt: at };
}

export interface Reckoning {
  journal: JobJournal;
  /** True exactly once: the pass that turned `running` into `interrupted`. */
  interrupted: boolean;
  /** The row-facing sentence; null when there was nothing to recover. */
  reason: string | null;
}

/**
 * The restart rule: an unfinished journal becomes `interrupted` ONCE. A second
 * scan sees `interrupted` and leaves it alone, so a reopened tab cannot flip
 * the same crash into a new alert, and nothing here ever starts a run.
 */
export function reconcile(j: JobJournal, at: string): Reckoning {
  if (j.state !== "running") return { journal: j, interrupted: false, reason: null };
  const journal: JobJournal = { ...j, state: "interrupted", updatedAt: at };
  return { journal, interrupted: true, reason: interruptionSentence(journal) };
}

/**
 * A run that crashed AFTER its own commit is not an interruption — it finished.
 * The committed record's timestamp is compared with the journal's last write,
 * so the pointer (not the journal) stays the truth of "did this publish?".
 */
export function completedBy(j: JobJournal, committedAt: string | null): boolean {
  if (j.state !== "running" || committedAt === null) return false;
  return committedAt >= j.updatedAt;
}

/** The last attempt that ran (started or finished), or null for a bare journal. */
export function lastAttempt(j: JobJournal): Attempt | null {
  return j.attempts[j.attempts.length - 1] ?? null;
}

/** The last stage that actually began; null when the run never got that far. */
export function lastStage(j: JobJournal): JournalStage | null {
  return j.attempts[j.attempts.length - 1]?.stage ?? null;
}

/** The paid metadata stage was entered at least once (its outcome unknown or known). */
export function paidStageEntered(j: JobJournal): boolean {
  return j.draft?.provenance.origin === "ai" || j.attempts.some((a) => a.stage === "metadata");
}

/**
 * The one sentence a recovered row carries. It never claims the run will
 * resume: a draft means no new request is needed, its absence means exactly
 * that the model may have to be asked again — by the user, on purpose.
 */
export function recoveryWarning(j: JobJournal): string | null {
  return j.state === "interrupted" ? interruptionSentence(j) : null;
}

/** The interruption sentence, for a journal that IS interrupted. */
function interruptionSentence(j: JobJournal): string {
  const stage = lastStage(j) ?? "preflight";
  if (j.draft !== null) return `Interrupted at ${stage} — the accepted metadata is saved; a re-export reuses it and does not ask the model again`;
  if (paidStageEntered(j)) return `Interrupted at ${stage} — a paid request's outcome is unknown; nothing is resent automatically`;
  return `Interrupted at ${stage} — re-export to finish`;
}

export function serializeJournal(j: JobJournal): string {
  return JSON.stringify(j);
}

/**
 * Reads a journal back, tolerantly (RULE 13): unknown stages and outcomes are
 * dropped, a draft that no longer passes the current policy is dropped too
 * (it could never be exported), and a payload without identity is null.
 */
export function parseJournal(text: string): JobJournal | null {
  const raw = safeParse(text);
  if (!isRecord(raw) || raw.v !== JOURNAL_VERSION) return null;
  if (typeof raw.pairId !== "string" || raw.pairId === "") return null;
  const source = parseSource(raw.source);
  if (source === null) return null;
  const state = parseState(raw.state);
  if (state === null) return null;
  return {
    v: JOURNAL_VERSION,
    pairId: raw.pairId,
    source,
    state,
    attempts: parseAttempts(raw.attempts),
    draft: parseDraft(raw.draft),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parseSource(raw: unknown): JobJournal["source"] | null {
  if (!isRecord(raw) || typeof raw.relPath !== "string" || raw.relPath === "") return null;
  if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version < 1) return null;
  return { relPath: raw.relPath, version: raw.version };
}

function parseState(raw: unknown): JournalState | null {
  const states: JournalState[] = ["running", "interrupted", "processed", "partial", "failed", "cancelled"];
  return typeof raw === "string" && (states as string[]).includes(raw) ? (raw as JournalState) : null;
}

function parseAttempts(raw: unknown): Attempt[] {
  if (!Array.isArray(raw)) return [];
  const out: Attempt[] = [];
  for (const item of raw.slice(-MAX_ATTEMPTS)) {
    if (!isRecord(item)) continue;
    const stage = parseStage(item.stage);
    const outcome = parseOutcome(item.outcome);
    if (stage === null || outcome === null) continue;
    out.push({ stage, outcome, detail: typeof item.detail === "string" ? item.detail : null, at: typeof item.at === "string" ? item.at : "" });
  }
  return out;
}

function parseStage(raw: unknown): JournalStage | null {
  return typeof raw === "string" && (JOURNAL_STAGES as readonly string[]).includes(raw) ? (raw as JournalStage) : null;
}

function parseOutcome(raw: unknown): AttemptOutcome | null {
  const outcomes: AttemptOutcome[] = ["started", "done", "failed", "cancelled"];
  return typeof raw === "string" && (outcomes as string[]).includes(raw) ? (raw as AttemptOutcome) : null;
}

/** A draft that no longer validates is not a draft — recovery must ask again. */
function parseDraft(raw: unknown): JournalDraft | null {
  if (!isRecord(raw)) return null;
  const meta = parseMeta(raw.meta);
  const provenance = parseProvenance(raw.provenance);
  if (meta === null || provenance === null) return null;
  return { meta, provenance };
}

/** The provenance fields a draft must carry; junk is dropped, never guessed. */
function parseProvenance(raw: unknown): MetadataProvenance | null {
  if (!isRecord(raw) || (raw.origin !== "user" && raw.origin !== "ai")) return null;
  if (typeof raw.prompt !== "string" || typeof raw.policy !== "string" || typeof raw.generatedAt !== "string") return null;
  return {
    origin: raw.origin,
    prompt: raw.prompt,
    model: typeof raw.model === "string" ? raw.model : "",
    endpointHost: typeof raw.endpointHost === "string" ? raw.endpointHost : "",
    requestId: typeof raw.requestId === "string" ? raw.requestId : null,
    inputTokens: numOrNull(raw.inputTokens),
    outputTokens: numOrNull(raw.outputTokens),
    estimatedCostUsd: numOrNull(raw.estimatedCostUsd),
    generatedAt: raw.generatedAt,
    policy: raw.policy,
  };
}

function numOrNull(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function parseMeta(raw: unknown): IconMetadata | null {
  if (!isRecord(raw) || typeof raw.title !== "string" || typeof raw.description !== "string") return null;
  if (!Array.isArray(raw.tags) || raw.tags.some((t) => typeof t !== "string")) return null;
  const meta: IconMetadata = { title: raw.title, description: raw.description, tags: raw.tags as string[] };
  return validateMetadata(meta).length === 0 ? meta : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
